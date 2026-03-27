import os
import json
import logging

class PersistenceManager:
    def __init__(self, app_name="CmdQ"):
        self.app_data_dir = os.path.join(os.path.expanduser("~"), f".{app_name.lower()}")
        if not os.path.exists(self.app_data_dir):
            os.makedirs(self.app_data_dir)
        
        self.files = {
            "connections": os.path.join(self.app_data_dir, "connections.json"),
            "queries": os.path.join(self.app_data_dir, "queries.json"),
            "conversations": os.path.join(self.app_data_dir, "conversations.json"),
            "api_keys": os.path.join(self.app_data_dir, "api_keys.json")
        }
        
        # Initialize files if they don't exist
        for key, file_path in self.files.items():
            if not os.path.exists(file_path):
                with open(file_path, 'w', encoding='utf-8') as f:
                    json.dump([], f)

    def _read_file(self, key):
        try:
            with open(self.files[key], 'r', encoding='utf-8') as f:
                return json.load(f)
        except Exception as e:
            logging.error(f"Error reading {key}: {e}")
            return []

    def _write_file(self, key, data):
        try:
            with open(self.files[key], 'w', encoding='utf-8') as f:
                json.dump(data, f, indent=4)
            return True
        except Exception as e:
            logging.error(f"Error writing {key}: {e}")
            return False

    def get_items(self, key):
        return self._read_file(key)

    def save_item(self, key, item):
        items = self._read_file(key)
        # Check if item with same ID exists (assuming item is a dict with an 'id')
        if 'id' in item:
            for i, existing in enumerate(items):
                if existing.get('id') == item['id']:
                    items[i] = item
                    break
            else:
                items.append(item)
        else:
            items.append(item)
        return self._write_file(key, items)

    def delete_item(self, key, item_id):
        items = self._read_file(key)
        items = [i for i in items if i.get('id') != item_id]
        return self._write_file(key, items)

storage = PersistenceManager()
