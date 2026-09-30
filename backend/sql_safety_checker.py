"""
Unified SQL safety checker for all execution paths.

Replaces duplicated safety logic in:
- agent_tools.py (API agent path)
- routes/ai.py (CLI path)
- db_context_builder.py (schema filtering for AI prompts)

Provides:
- Destructive SQL detection (DROP/ALTER/TRUNCATE/DELETE)
- Granular protection with arbitrary write permission combinations
- Schema filtering with FK-aware visibility
"""

import re
import logging
from enum import Enum
from dataclasses import dataclass, field
from typing import Optional

logger = logging.getLogger("cmdq-backend")


class ProtectionLevel(str, Enum):
    FULL = "full"          # Hidden from AI, all operations blocked
    READONLY = "readonly"  # Visible in schema, all writes blocked
    CUSTOM = "custom"      # Visible, specific writes allowed via write_permissions
    NONE = "none"          # No protection


# All possible write permission values
ALL_WRITE_OPS = frozenset({"insert", "update", "delete"})

TABLE_IDENT_PATTERN = r'((?:[a-zA-Z0-9_]+|"[^"]+"|`[^`]+`|\[[^\]]+\])(?:\s*\.\s*(?:[a-zA-Z0-9_]+|"[^"]+"|`[^`]+`|\[[^\]]+\]))?)'

# Patterns to extract table references from SQL.
# Order matters: specific write patterns FIRST, then generic read patterns.
# This ensures DELETE FROM logs marks 'logs' as write, not read.
_TABLE_EXTRACT_PATTERNS = [
    (re.compile(rf'\bINSERT\s+INTO\s+{TABLE_IDENT_PATTERN}', re.IGNORECASE), "write", "insert"),
    (re.compile(rf'\bUPDATE\s+{TABLE_IDENT_PATTERN}', re.IGNORECASE), "write", "update"),
    (re.compile(rf'\bDELETE\s+FROM\s+{TABLE_IDENT_PATTERN}', re.IGNORECASE), "write", "delete"),
    (re.compile(rf'\bDROP\s+TABLE\s+(?:IF\s+EXISTS\s+)?{TABLE_IDENT_PATTERN}', re.IGNORECASE), "write", "ddl"),
    (re.compile(rf'\bALTER\s+TABLE\s+{TABLE_IDENT_PATTERN}', re.IGNORECASE), "write", "ddl"),
    (re.compile(rf'\bTRUNCATE\s+(?:TABLE\s+)?{TABLE_IDENT_PATTERN}', re.IGNORECASE), "write", "ddl"),
    (re.compile(rf'\bCREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?{TABLE_IDENT_PATTERN}', re.IGNORECASE), "write", "ddl"),
    (re.compile(rf'\b(?:FROM|JOIN)\s+{TABLE_IDENT_PATTERN}', re.IGNORECASE), "read", None),
]


def normalize_table_ref(raw: str) -> str:
    cleaned = re.sub(r'[`"\[\]]', '', raw)
    cleaned = re.sub(r'\s*\.\s*', '.', cleaned)
    return cleaned.strip().lower()


@dataclass
class ProtectionRule:
    """A single protection rule.

    Attributes:
        id: Composite key, e.g. "connId::db::schema::table"
        level: Protection level (full/readonly/custom/none)
        write_permissions: Set of allowed write ops when level=custom.
                          Subset of {"insert", "update", "delete"}.
                          E.g. {"insert", "update"} means INSERT and UPDATE allowed, DELETE blocked.
        connection_id: The connection this rule belongs to.
        protected_at: ISO timestamp when rule was created.
    """
    id: str
    level: ProtectionLevel
    write_permissions: set = field(default_factory=set)
    connection_id: str = ""
    protected_at: str = ""

    @property
    def bare_name(self) -> str:
        """The last segment (e.g., 'public.salaries' from 'connId::db::public.salaries')."""
        return self.id.split("::")[-1].lower()

    @property
    def schema_table(self) -> tuple[str, str] | None:
        """Parse (schema, table) from bare_name if it contains a dot."""
        bare = self.id.split("::")[-1]
        if "." in bare:
            parts = bare.split(".", 1)
            return (parts[0].lower(), parts[1].lower())
        return None

    def matches(self, schema_name: Optional[str], table_name: str) -> bool:
        """Check if this rule matches the given table (and optional schema)."""
        table_clean = table_name.lower()
        schema_clean = schema_name.lower() if schema_name else None

        if "." in table_clean:
            s_part, t_part = table_clean.split(".", 1)
            schema_clean = schema_clean or s_part
            table_clean = t_part

        parts = [p.lower() for p in self.id.split("::")]

        # Case 1: 4 or more parts (e.g. conn::db::schema::table)
        if len(parts) >= 4:
            rule_schema = parts[-2]
            rule_table = parts[-1]
            if schema_clean:
                return (rule_schema == schema_clean) and (rule_table == table_clean)
            return rule_table == table_clean

        # Case 2: schema.table in last segment (e.g. conn::db::schema.table or schema.table)
        if "." in parts[-1]:
            s_part, t_part = parts[-1].split(".", 1)
            if schema_clean:
                return (s_part == schema_clean) and (t_part == table_clean)
            return t_part == table_clean

        # Case 3: schema-level protection (e.g. conn::db::schema)
        if len(parts) == 3 and schema_clean:
            rule_schema = parts[-1]
            return rule_schema == schema_clean

        # Case 4: single bare name matching table or schema
        if len(parts) == 1:
            if "." in parts[0]:
                s_part, t_part = parts[0].split(".", 1)
                if schema_clean:
                    return (s_part == schema_clean) and (t_part == table_clean)
                return t_part == table_clean
            return parts[0] == table_clean or (schema_clean and parts[0] == schema_clean)

        # Fallback: check last segment
        return parts[-1] == table_clean

    def allowed_write_ops(self) -> set:
        """Return the set of allowed write operations for this rule."""
        if self.level == ProtectionLevel.FULL:
            return set()       # Nothing allowed
        if self.level == ProtectionLevel.READONLY:
            return set()       # No writes
        if self.level == ProtectionLevel.CUSTOM:
            return self.write_permissions.copy()
        return ALL_WRITE_OPS   # NONE level = everything allowed


class SQLSafetyChecker:
    """Unified safety checker for all SQL execution paths.

    Usage:
        checker = SQLSafetyChecker(protected_items=[
            {"id": "connId::db::public::salaries", "level": "full"},
            {"id": "connId::db::public::employees", "level": "custom",
             "write_permissions": ["insert", "update"]},
        ])
        is_safe, error = checker.check_all(sql)
    """

    def __init__(self, protected_items: Optional[list[dict | str]] = None):
        if protected_items is None:
            try:
                from persistence_manager import storage
                protected_items = storage.get_items("protected_items")
            except Exception:
                protected_items = []

        self.rules = []
        for item in protected_items:
            if isinstance(item, str):
                self.rules.append(ProtectionRule(id=item, level=ProtectionLevel.FULL))
            elif isinstance(item, dict):
                level_str = item.get("level", "full")
                try:
                    level = ProtectionLevel(level_str)
                except ValueError:
                    level = ProtectionLevel.FULL

                # Parse write_permissions
                raw_perms = item.get("write_permissions", [])
                if isinstance(raw_perms, list):
                    write_permissions = set()
                    for p in raw_perms:
                        p_lower = str(p).lower()
                        if p_lower in ALL_WRITE_OPS:
                            write_permissions.add(p_lower)
                else:
                    write_permissions = set()

                self.rules.append(ProtectionRule(
                    id=item.get("id", ""),
                    level=level,
                    write_permissions=write_permissions,
                    connection_id=item.get("connection_id", ""),
                    protected_at=item.get("protected_at", ""),
                ))

    def _is_destructive(self, sql: str) -> Optional[str]:
        """Check for destructive SQL operations (DROP, ALTER, TRUNCATE, DELETE without WHERE).

        Returns error message if destructive, None if safe.
        """
        upper = sql.upper()

        # Check DROP / ALTER / TRUNCATE (with optional newlines/whitespace after keyword)
        for kw in ["DROP", "ALTER", "TRUNCATE"]:
            if re.search(rf'\b{kw}\b', upper):
                return f"BLOCKED: '{kw}' operation is not allowed."

        # Check DELETE without WHERE
        if re.search(r'\bDELETE\b', upper):
            if not re.search(r'\bWHERE\b', upper):
                return "BLOCKED: DELETE without WHERE clause is not allowed."

        return None

    def _extract_table_refs(self, sql: str) -> list[tuple[str, str, Optional[str]]]:
        """Extract table references from SQL.

        Returns list of (table_name, access_type, write_op) where:
        - access_type is 'read' or 'write'
        - write_op is 'insert', 'update', 'delete', 'ddl', or None for reads
        Table names are lowercased and may be 'schema.table' or just 'table'.
        """
        refs = []
        seen = set()
        for pattern, access_type, write_op in _TABLE_EXTRACT_PATTERNS:
            for match in pattern.finditer(sql):
                table_ref = normalize_table_ref(match.group(1))
                if table_ref in seen:
                    continue
                seen.add(table_ref)
                refs.append((table_ref, access_type, write_op))
        return refs

    def _find_matching_rule(self, table_ref: str) -> Optional[ProtectionRule]:
        """Find a protection rule matching a table reference."""
        table_lower = table_ref.lower()
        schema_name = None
        table_name = table_lower
        if "." in table_lower:
            schema_name, table_name = table_lower.split(".", 1)

        for rule in self.rules:
            if rule.level == ProtectionLevel.NONE:
                continue
            if rule.matches(schema_name, table_name):
                return rule
        return None

    def check_destructive(self, sql: str) -> Optional[str]:
        """Check if SQL is destructive. Returns error or None."""
        return self._is_destructive(sql)

    def check_protected(self, sql: str) -> Optional[str]:
        """Check if SQL targets a fully-protected item. Returns error or None."""
        refs = self._extract_table_refs(sql)
        for table_ref, _, _ in refs:
            rule = self._find_matching_rule(table_ref)
            if rule and rule.level == ProtectionLevel.FULL:
                return f"BLOCKED: '{table_ref}' is fully protected and cannot be accessed."
        return None

    def check_writable(self, sql: str) -> Optional[str]:
        """Check if SQL performs a write operation on a protected item.

        Uses the rule's allowed_write_ops() to determine which writes are permitted.
        Any write operation not in the allowed set is blocked.

        Returns error or None.
        """
        # Collect (table_ref, write_op) pairs for this SQL
        sql_writes = []
        for table_ref, access_type, write_op in self._extract_table_refs(sql):
            if access_type == "write" and write_op is not None:
                sql_writes.append((table_ref, write_op))

        if not sql_writes:
            return None  # Read-only query, always allowed

        # Check each write against its table's protection rule
        for table_ref, write_op in sql_writes:
            rule = self._find_matching_rule(table_ref)
            if not rule:
                continue

            allowed = rule.allowed_write_ops()
            if write_op not in allowed:
                # Figure out what the user tried vs what's allowed
                if not allowed:
                    return f"BLOCKED: '{table_ref}' ({rule.level.value}) does not allow any write operations."
                else:
                    allowed_str = ", ".join(sorted(allowed))
                    return f"BLOCKED: '{table_ref}' ({rule.level.value}) allows [{allowed_str}] but not '{write_op}'."

        return None

    def check_table_access(self, schema_name: str, table_name: str, write_op: Optional[str] = "insert") -> tuple[bool, str]:
        """Check if accessing / writing to a specific table is allowed."""
        rule = self._find_table_rule(schema_name, table_name)
        if not rule:
            return True, ""
        if rule.level == ProtectionLevel.FULL:
            return False, f"BLOCKED: '{schema_name}.{table_name}' is fully protected and cannot be accessed."
        if write_op is not None:
            allowed = rule.allowed_write_ops()
            if write_op not in allowed:
                if not allowed:
                    return False, f"BLOCKED: '{schema_name}.{table_name}' ({rule.level.value}) does not allow any write operations."
                allowed_str = ", ".join(sorted(allowed))
                return False, f"BLOCKED: '{schema_name}.{table_name}' ({rule.level.value}) allows [{allowed_str}] but not '{write_op}'."
        return True, ""

    def check_all(self, sql: str, context: str = "general") -> tuple[bool, str]:
        """Run all safety checks on SQL.

        Args:
            sql: The SQL statement to check.
            context: Origin context for logging ('agent', 'cli', 'general', 'query', 'import').

        Returns:
            (is_safe, error_message) tuple. If is_safe is True, error_message is empty.
        """
        # 1. Destructive check (always applies for agent / cli context)
        if context in ("agent", "cli"):
            err = self.check_destructive(sql)
            if err:
                logger.info("Safety block (%s): %s | SQL: %s", context, err, sql[:200])
                return False, err

        # 2. Full protection check
        err = self.check_protected(sql)
        if err:
            logger.info("Protection block (%s): %s | SQL: %s", context, err, sql[:200])
            return False, err

        # 3. Granular write permission check
        err = self.check_writable(sql)
        if err:
            logger.info("Write permission block (%s): %s | SQL: %s", context, err, sql[:200])
            return False, err

        return True, ""

    def filter_schema(self, schema_dict: dict) -> dict:
        """Remove FULL-protection tables from schema dict.

        For non-full protection, keep table visible with '_protection' marker
        indicating what the AI is allowed to do.
        """
        filtered = {}
        for schema_name, tables in schema_dict.items():
            for table_name, table_info in tables.items():
                rule = self._find_table_rule(schema_name, table_name)
                if rule is None:
                    # No protection rule — include fully
                    filtered.setdefault(schema_name, {})[table_name] = table_info
                elif rule.level == ProtectionLevel.FULL:
                    # Fully hidden — skip entirely
                    continue
                else:
                    # Partial protection — include with marker
                    if rule.level == ProtectionLevel.CUSTOM:
                        marker = f"custom:{','.join(sorted(rule.write_permissions))}"
                    else:
                        marker = rule.level.value
                    marked_info = {**table_info, "_protection": marker}
                    filtered.setdefault(schema_name, {})[table_name] = marked_info
        return filtered

    def filter_schema_for_fk(
        self, schema_dict: dict, relationships: list[dict]
    ) -> dict:
        """FK-aware filtering.

        If an unprotected table has an FK pointing to a FULL-protected table,
        keep the protected table's name + PK columns visible (enough for JOIN resolution)
        but mark it clearly as protected.
        """
        # First, apply normal filtering
        filtered = self.filter_schema(schema_dict)

        # Find FULL-protected tables that are referenced by unprotected tables
        full_protected = set()
        for schema_name, tables in schema_dict.items():
            for table_name in tables:
                rule = self._find_table_rule(schema_name, table_name)
                if rule and rule.level == ProtectionLevel.FULL:
                    full_protected.add((schema_name.lower(), table_name.lower()))

        # Find which protected tables are referenced by FK from visible tables
        referenced_protected = set()
        for rel in relationships:
            ref = (rel["referenced_schema"].lower(), rel["referenced_table"].lower())
            src_schema = rel["source_schema"]
            src_table = rel["source_table"]
            if src_schema in filtered and src_table in filtered.get(src_schema, {}):
                if ref in full_protected:
                    referenced_protected.add(ref)

        # Add minimal metadata for referenced protected tables
        for ref_schema, ref_table in referenced_protected:
            original = schema_dict.get(ref_schema, {}).get(ref_table, {})
            if not original:
                continue
            minimal = {
                "columns": original.get("columns", []),
                "_protected_ref": True,
            }
            filtered.setdefault(ref_schema, {})[ref_table] = minimal

        return filtered

    def _find_table_rule(self, schema_name: str, table_name: str) -> Optional[ProtectionRule]:
        """Find protection rule for a specific schema.table combination."""
        full_ref = f"{schema_name}.{table_name}".lower()
        for rule in self.rules:
            if rule.level == ProtectionLevel.NONE:
                continue
            if rule.bare_name == full_ref:
                return rule
            rule_name = rule.bare_name.split(".")[-1] if "." in rule.bare_name else rule.bare_name
            if rule_name == table_name.lower():
                return rule
            if rule.bare_name == schema_name.lower():
                return rule
        return None

    def is_table_protected(self, schema_name: str, table_name: str) -> bool:
        """Check if a specific table has any protection rule."""
        rule = self._find_table_rule(schema_name, table_name)
        return rule is not None

    def get_table_protection(self, schema_name: str, table_name: str) -> Optional[ProtectionRule]:
        """Get the protection rule for a specific table."""
        return self._find_table_rule(schema_name, table_name)
