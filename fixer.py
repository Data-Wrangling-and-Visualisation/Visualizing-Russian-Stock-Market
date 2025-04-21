with open('Database/combined_data_stock.json', 'r') as file:
    data = file.readlines()
data =[line.replace("}", "},") for line in data]
with open('Database/combined_data_stock.json', 'w') as file:
    file.writelines(data)