from flask import Flask, send_from_directory
from flask_cors import CORS

app = Flask(__name__, static_folder='../frontend', template_folder='../frontend')
CORS(app, resources={r"/api/*": {"origins": "http://127.0.0.1:5500"}})

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
    app.run(debug=True, port=5000)