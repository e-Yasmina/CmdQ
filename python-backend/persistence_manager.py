import os
import json
import logging
import portalocker


class PersistenceManager:
    def __init__(self, app_name="CmdQ"):
        self.app_data_dir = os.path.join(os.path.expanduser("~"), f".{app_name.lower()}")
        if not os.path.exists(self.app_data_dir):
            os.makedirs(self.app_data_dir)
        
        self.files = {
            "connections": os.path.join(self.app_data_dir, "connections.json"),
            "queries": os.path.join(self.app_data_dir, "queries.json"),
            "conversations": os.path.join(self.app_data_dir, "conversations.json"),
            "api_keys": os.path.join(self.app_data_dir, "api_keys.json"),
            "protected_items": os.path.join(self.app_data_dir, "protected_items.json")
        }
        
        # Initialize files if they don't exist
        for key, file_path in self.files.items():
            if not os.path.exists(file_path):
                with open(file_path, 'w', encoding='utf-8') as f:
                    json.dump([], f)

    def get_items(self, key):
        file_path = self.files[key]
        try:
            with portalocker.Lock(file_path, mode='r', encoding='utf-8',
                                 flags=portalocker.LOCK_SH | portalocker.LOCK_NB,
                                 timeout=5) as f:
                return json.load(f)
        except portalocker.LockException:
            logging.error(f"Could not acquire shared lock for {key}")
            return []
        except Exception as e:
            logging.error(f"Error reading {key}: {e}")
            return []

    def save_item(self, key, item):
        file_path = self.files[key]
        try:
            with portalocker.Lock(file_path, mode='a+', encoding='utf-8',
                                 flags=portalocker.LOCK_EX | portalocker.LOCK_NB,
                                 timeout=5) as f:
                f.seek(0)
                try:
                    items = json.load(f)
                except json.JSONDecodeError:
                    items = []
                if 'id' in item:
                    for i, existing in enumerate(items):
                        if existing.get('id') == item['id']:
                            items[i] = item
                            break
                    else:
                        items.append(item)
                else:
                    items.append(item)
                f.seek(0)
                f.truncate()
                json.dump(items, f, indent=4)
            return True
        except portalocker.LockException:
            logging.error(f"Could not acquire exclusive lock for {key}")
            return False

    def delete_item(self, key, item_id):
        file_path = self.files[key]
        try:
            with portalocker.Lock(file_path, mode='a+', encoding='utf-8',
                                 flags=portalocker.LOCK_EX | portalocker.LOCK_NB,
                                 timeout=5) as f:
                f.seek(0)
                try:
                    items = json.load(f)
                except json.JSONDecodeError:
                    items = []
                items = [i for i in items if i.get('id') != item_id]
                f.seek(0)
                f.truncate()
                json.dump(items, f, indent=4)
            return True
        except portalocker.LockException:
            logging.error(f"Could not acquire exclusive lock for {key}")
            return False


storage = PersistenceManager()
