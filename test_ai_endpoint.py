import urllib.request
import json

payload = {
    "command": "gemini",
    "prompt": "Please create a new database called etl_test_source_99. Inside it, create a table called users_old with the following columns: id (serial primary key), fname (varchar), lname (varchar), and age_string (varchar). Then, insert 3 rows of dummy data with names like 'John Doe' and ages represented as strings like '25'.",
    "db_config": {
        "db_type": "postgres",
        "host": "localhost",
        "port": 5432,
        "user": "postgres",
        "password": "postgres",
        "database": ""
    },
    "schema_json": {},
    "chat_history": []
}

try:
    req = urllib.request.Request("http://localhost:8000/ai/prompt", 
                                 data=json.dumps(payload).encode("utf-8"), 
                                 headers={"Content-Type": "application/json"},
                                 method="POST")
    with urllib.request.urlopen(req) as res:
        data = json.loads(res.read().decode("utf-8"))
        print("STATUS: 200")
        print("RESPONSE:", json.dumps(data, indent=2))
except urllib.error.HTTPError as e:
    print("HTTP ERROR:", e.code)
    try:
        print("ERROR BODY:", json.loads(e.read().decode("utf-8")))
    except:
        pass
except Exception as e:
    print("REQUEST FAILED:", e)
