# Import required Flask modules
from flask import Flask, send_from_directory
from flask_cors import CORS  # For handling Cross-Origin Resource Sharing (CORS)

# Create a Flask application instance
app = Flask(__name__)
# Enable CORS for all routes to allow cross-origin requests
CORS(app)

@app.route('/api/data/<data_type>')
def get_data(data_type):
    """
    API endpoint to serve different types of data files.
    
    Args:
        data_type (str): Type of data requested. Must be one of the keys in data_files dictionary.
        
    Returns:
        Response: The requested data file from the 'data' directory.
        
    Raises:
        404 Error: If the data_type is not found in data_files dictionary.
    """
    # Mapping of data types to their corresponding file names
    data_files = {
        'stock': 'Data.json',
        'index': 'combined_data_index.json',
        'dividend': 'div.json',
        "dictionary": "tickerDictionary.json",
        "indexStructure": "index_structure.json",
        "Index_dictionary": "indexDictionary.json",
        "indexIndustryStructure": "index_industry_structure.json",
        "tickerDescr": "ticker_descr.json"
    }
    # Send the requested file from the 'data' directory
    return send_from_directory('data', data_files[data_type])

@app.route('/')
def index():
    """
    Serve the main index.html file for the root route.
    
    Returns:
        Response: The index.html file from the static folder.
    """
    return send_from_directory(app.static_folder, 'index.html')

@app.route('/<path:path>')
def static_files(path):
    """
    Serve static files from the static folder.
    
    Args:
        path (str): The path to the static file relative to the static folder.
        
    Returns:
        Response: The requested static file.
    """
    return send_from_directory(app.static_folder, path)

if __name__ == '__main__':
    # Run the Flask application on all available network interfaces on port 5500
    app.run(host='0.0.0.0', port=5500)