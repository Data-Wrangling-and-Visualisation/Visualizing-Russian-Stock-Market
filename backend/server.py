from flask import Flask, send_from_directory
from flask_cors import CORS

app = Flask(__name__)
# Разрешаем все CORS для упрощения (в production ограничьте!)
CORS(app) 

@app.route('/api/data/<data_type>')
def get_data(data_type):
    data_files = {
        'stock': 'Data.json',
        'index': 'combined_data_index.json',
        'dividend': 'div.json',
        "dictionary": "tickerDictionary.json",
        "indexStructure": "index_structure.json",
        "indexIndustryStructure": "index_industry_structure.json"
    }
    return send_from_directory('data', data_files[data_type])

@app.route('/')
def index():
    return send_from_directory(app.static_folder, 'index.html')

@app.route('/<path:path>')
def static_files(path):
    return send_from_directory(app.static_folder, path)

if __name__ == '__main__':
    app.run(host='0.0.0.0', port=5000)