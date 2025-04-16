
const config = {
    defaultTicker: 'SBER',
    mainChart: {
        height: 400,
        margin: { top: 40, right: 40, bottom: 30, left: 60 },
        candleWidth: 2
    },
    volumeChart: {
        height: 150,
        margin: { top: 30, right: 40, bottom: 40, left: 80 }
    },
    structureCharts: {
        width: 500,
        height: 400,
        margin: {top: 40, right: 30, bottom: 60, left: 60}
    }
};

let allData = [];
let allDataIndex = [];
let filteredData = [];
let xMainScale, yMainScale, xVolumeScale, yVolumeScale;
let brush;
let currentTicker = config.defaultTicker;
let tickerMap = {};
let moexData = {
    composition: {},
    sectors: {}
};
let colorScale = d3.scaleOrdinal(d3.schemeTableau10);
let structureTooltip = d3.select("body").append("div")
    .attr("class", "tooltip")
    .style("opacity", 0);
const tickerSets = {
    stocks: ["SBER", "GAZP", "GMKN", "MTSS", "RNFT", "LKOH", "PLZL", "VTBR"],
    indices: ["IMOEX", "IMOEX2", "RTSI", "IMOEXCNY", "MOEXBC", "MOEXOG",
        "MOEXEU", "MOEXTL", "MOEXMM", "MOEXFN"]
}

async function initApp() {
    setupUI();
    await loadData(currentTicker);
    await loadIndexData();
    createCombinedCharts(filteredData, currentTicker);
    createDividend(filter_dividends);
    createOpenPriceChart(currentTicker);
    setupPeriodButtons();
    updateStructureCharts();  
}


async function loadData(ticker) {
        const originalData = await fetchData('stock');
        const originalData2 = await fetchData('index');
        allData = originalData.filter(item => item.STOCK_TICK === ticker && item.period === 'D')
                            .map(item => ({
                                ...item,
                                begin: new Date(item.begin),
                                type: item.close >= item.open ? 'bullish' : 'bearish'
                            }));
        allDataIndex = originalData2.filter(item => item.INDEX_TICK === ticker && item.period === 'D')
                            .map(item => ({
                                ...item,
                                begin: new Date(item.begin),
                                type: item.close >= item.open ? 'bullish' : 'bearish'
                            }));
        filteredData = [...allData];
        const divData = await fetchData('dividend');
        dividends = divData.filter(item => item.DIV_TICK === ticker);
        filter_dividends = [...dividends];
        currentTicker = ticker;
        fetchData('dictionary');
}

async function loadIndexData() {
    try {

        const [structureRes, industryRes] = await Promise.all([
            fetchData('indexStructure'),
            fetchData('indexIndustryStructure')
        ]);

        console.log('Successfully loaded:', {
            structureKeys: Object.keys(structureRes),
            industryKeys: Object.keys(industryRes)
        });

        moexData.composition = structureRes;
        moexData.sectors = industryRes;

    } catch (error) {
        console.error("Error loading index data:", error);
        moexData = { composition: {}, sectors: {} };
        
    }
}

// async function fetchDividendData(){
//     const response = await fetch(config.dataDividend);
//     if (!response.ok) {
//         throw new Error(`HTTP error! status: ${response.status}`);
//     }
//     return await response.json();
// }

async function fetchData(type) {
    if (type === "dictionary") {
        fetch('http://localhost:5500/api/data/dictionary')
        .then(response => response.json())
        .then(data => {
          tickerMap = data;
          initAutocomplete();
        })
        .catch(error => console.error("Dictionary download error:", error));
    } else {
        const response = await fetch(`http://localhost:5500/api/data/${type}`);
        if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
        return await response.json();
    }
}

// async function fetchDataIndex() {
//     const response = await fetch(config.dataIndex);
//     if (!response.ok) {
//         throw new Error(`HTTP error! status: ${response.status}`);
//     }
//     return await response.json();
// }

// async function fetchDictionary(){
//     fetch('tickerDictionary.json')
// .then(response => response.json())
// .then(data => {
//   tickerMap = data;
//   initAutocomplete();
// })
// .catch(error => console.error("Ошибка загрузки словаря:", error));
// }

function setupUI() {
    const headerSearch = document.getElementById('headerSearch');
    const searchInput = document.createElement("input");
    searchInput.type = "text";
    searchInput.placeholder = "Название тикера (SBER, GAZP...) или компании";
    searchInput.id = "tickerInput";
    searchInput.autocomplete = "off";

    const tickerDatalist = document.createElement("datalist");
    tickerDatalist.id = "tickerSuggestions";
    searchInput.setAttribute("list", "tickerSuggestions");

    const searchButton = document.createElement("button");
    searchButton.textContent = "Поиск";
    searchButton.id = "searchBtn";


    headerSearch.appendChild(searchInput);
    headerSearch.appendChild(tickerDatalist);
    headerSearch.appendChild(searchButton);

    searchButton.addEventListener("click", searchTicker);
    searchInput.addEventListener("keypress", (e) => {
        if (e.key === "Enter") searchTicker();
    });

    initAutocomplete();

    const periodSelector = document.createElement("div");
    periodSelector.className = "period-selector";
    periodSelector.innerHTML = `
        <button class="period-btn active" data-period="month">Месяц</button>
        <button class="period-btn" data-period="year">Год</button>
        <button class="period-btn" data-period="all">Все данные</button>
    `;
    document.getElementById('chart-container').appendChild(periodSelector);
}

function initAutocomplete() {
    const datalist = document.getElementById('tickerSuggestions');
    
    const allOptions = [
      ...Object.keys(tickerMap), 
      ...Object.values(tickerMap)
    ];
  
    allOptions.forEach(item => {
      const option = document.createElement('option');
      option.value = item;
      datalist.appendChild(option);
    });
  }

  function searchTicker() {
    const input = document.getElementById('tickerInput').value.trim();
    if (!input) return;
  
    const upperInput = input.toUpperCase();
  
    const foundTicker = Object.values(tickerMap).find(ticker => 
      ticker.toUpperCase() === upperInput
    );
  
    if (foundTicker) {
      loadData(foundTicker).then(() => {
        createCombinedCharts(filteredData, foundTicker);
        createDividend(filter_dividends);
        createOpenPriceChart(foundTicker);
      });
      return;
    }
  
    const foundCompany = Object.keys(tickerMap).find(company => 
      company.toUpperCase().includes(upperInput)
    );
  
    if (foundCompany) {
      const ticker = tickerMap[foundCompany];
      loadData(ticker).then(() => {
        createCombinedCharts(filteredData, ticker);
        createDividend(filter_dividends);
        createOpenPriceChart(ticker);
      });
    } else {
      alert("Ничего не найдено! Проверьте название или тикер.");
    }
  }

function setupScales(data, width, mainHeight, volumeHeight) {
    xMainScale = d3.scaleTime()
        .domain(d3.extent(data, d => d.begin))
        .range([config.mainChart.margin.left, width - config.mainChart.margin.right]);

    yMainScale = d3.scaleLinear()
        .domain([d3.min(data, d => d.low) * 0.99, d3.max(data, d => d.high) * 1.01])
        .range([mainHeight - config.mainChart.margin.bottom, config.mainChart.margin.top]);

    xVolumeScale = d3.scaleTime()
        .domain(xMainScale.domain())
        .range([config.volumeChart.margin.left, width - config.volumeChart.margin.right]);

    yVolumeScale = d3.scaleLinear()
        .domain([0, d3.max(data, d => d.volume)])
        .range([volumeHeight - config.volumeChart.margin.bottom, config.volumeChart.margin.top]);
}

function adjustXTicks(scale, width) {
    const targetTickCount = 8;
    const approxTickInterval = width / targetTickCount;
    

    let ticks = scale.ticks();
    
    if (ticks.length <= targetTickCount) {
        return ticks;
    }
    
    const step = Math.max(1, Math.floor(ticks.length / targetTickCount));
    
    const adjustedTicks = [];
    for (let i = 0; i < ticks.length; i += step) {
        adjustedTicks.push(ticks[i]);
        if (adjustedTicks.length >= targetTickCount) break;
    }
    
    return adjustedTicks;
}

function createCombinedCharts(data, ticker) {
    const containerWidth = document.getElementById('chart-container').clientWidth;
    const width = containerWidth - 20;
    const mainHeight = config.mainChart.height;
    const volumeHeight = config.volumeChart.height;

    d3.select("#main-chart").html("");
    d3.select("#volume-chart").html("");

    const mainSvg = d3.select("#main-chart")
        .append("svg")
        .attr("width", width)
        .attr("height", mainHeight);

    const volumeSvg = d3.select("#volume-chart")
        .append("svg")
        .attr("width", width)
        .attr("height", volumeHeight);

    setupScales(data, width, mainHeight, volumeHeight);
    createCandlestickChart(mainSvg, data, width, mainHeight, ticker);
    createVolumeChart(volumeSvg, data, width, volumeHeight);
    addBrush(volumeSvg, data, width, volumeHeight);
}

function createCandlestickChart(svg, data, width, height, ticker) {
    svg.selectAll("*").remove();

    let xAxis = d3.axisBottom(xMainScale)
        .tickFormat(d3.timeFormat("%b %Y"))
        .tickValues(adjustXTicks(xMainScale, width - config.mainChart.margin.left - config.mainChart.margin.right));
    svg.selectAll(".candle")
        .data(data)
        .enter()
        .append("g")
        .attr("class", "candle")
        .attr("transform", d => `translate(${xMainScale(d.begin)},0)`)
        .each(function(d) {
            const g = d3.select(this);
            const candleWidth = config.mainChart.candleWidth;
            const halfWidth = candleWidth / 2;
            
            g.append("rect")
                .attr("x", -halfWidth)
                .attr("y", d.type === 'bullish' ? yMainScale(d.close) : yMainScale(d.open))
                .attr("width", candleWidth)
                .attr("height", Math.abs(yMainScale(d.open) - yMainScale(d.close)))
                .attr("fill", d.type === 'bullish' ? '#436239' : '#c62f2d');
            
            g.append("line")
                .attr("x1", 0)
                .attr("x2", 0)
                .attr("y1", yMainScale(d.high))
                .attr("y2", yMainScale(d.low))
                .attr("stroke", d.type === 'bullish' ? '#436239' : '#c62f2d')
                .attr("stroke-width", 1);
        });

    svg.append("g")
        .attr("class", "x-axis")
        .attr("transform", `translate(0,${height - config.mainChart.margin.bottom})`)
        .call(xAxis);

    svg.append("g")
        .attr("class", "y-axis")
        .attr("transform", `translate(${config.mainChart.margin.left},0)`)
        .call(d3.axisLeft(yMainScale));

    svg.append("text")
        .attr("x", width / 2)
        .attr("y", config.mainChart.margin.top / 2 + 12)
        .attr("text-anchor", "middle")
        .style("font-size", "18px")
        .style("font-weight", "700")
        .text(`${ticker} - Свечной график`);
}

function createVolumeChart(svg, data, width, height) {
    svg.selectAll("*").remove();
    const x = d3.scaleBand()
    .domain(data.map(d => d.category))
    .range([0, width])
    .padding(0.2);
    svg.selectAll(".volume-bar")
        .data(data)
        .enter()
        .append("rect")
        .attr("class", "volume-bar")
        .attr("x", d => xVolumeScale(d.begin) - config.mainChart.candleWidth/2)
        .attr("y", d => yVolumeScale(d.volume))
        .attr("width", config.mainChart.candleWidth)
        .attr("height", d => height - config.volumeChart.margin.bottom - yVolumeScale(d.volume))
        .attr("fill", "#4285f4");

    svg.append("g")
        .attr("class", "x-axis")
        .attr("transform", `translate(0,${height - config.volumeChart.margin.bottom})`)
        .call(d3.axisBottom(xVolumeScale));

    svg.append("g")
        .attr("class", "y-axis")
        .attr("transform", `translate(${config.volumeChart.margin.left},0)`)
        .call(d3.axisLeft(yVolumeScale)
        .ticks(7));

    svg.append("text")
        .attr("x", width / 2)
        .attr("y", config.volumeChart.margin.top - 10)
        .attr("class", "volume-title")
        .style("font-size", "14px")
        .text("Объем торгов");
}

function createDividend(data) {
    if (data.length > 0) {
        const container = d3.select("#additional_content");
        container.selectAll("*").remove();
        
        // Set container to occupy half of parent width
        container.style("width", "50%");
        container.style("margin-left", "2.5%");
        
        // Create tooltip
        const tooltip = d3.select("body").append("div")
            .attr("class", "tooltip")
            .style("opacity", 0)
            .style("position", "absolute")
            .style("background", "white")
            .style("border", "1px solid #ddd")
            .style("padding", "8px")
            .style("border-radius", "4px")
            .style("pointer-events", "none");

        // Get the adjusted container width
        const containerWidth = container.node().getBoundingClientRect().width;
        const width = containerWidth;
        const height = 400;
        const margin = {top: 40, right: 20, bottom: 100, left: 60};
        const innerWidth = width - margin.left - margin.right;
        const innerHeight = height - margin.top - margin.bottom;
        const timeFormat = d3.timeFormat("%b %Y");

        const svg = container.append("svg")
            .attr("width", width)
            .attr("height", height)
            .append("g")
            .attr("transform", `translate(${margin.left},${margin.top})`);

        // Process data
        const processedData = data.map(d => ({
            name: timeFormat(new Date(d.registryclosedate)),
            value: parseFloat(d.value),
            currency: d.currencyid
        }));

        // Create scales
        const x = d3.scaleBand()
            .domain(processedData.map(d => d.name))
            .range([0, innerWidth])
            .padding(0.3);

        const y = d3.scaleLinear()
            .domain([0, d3.max(processedData, d => d.value) * 1.1])
            .nice()
            .range([innerHeight, 0]);

        // Custom color palette
        const colorPalette = [
            "#214517", // dark green
            "#9baf9f", // gray-green
            "#c62f2d", // red
            "#e5ac9d", // light pink
            "#638159", //light green
            "#cbc8c9" // very light gray
        ];

        // Add Y-axis with grid lines
        svg.append("g")
            .attr("class", "y-axis")
            .call(d3.axisLeft(y)
                .tickSize(-innerWidth)
                .tickFormat(d => `${d} руб.`)
            )
            .call(g => g.select(".domain").remove())
            .call(g => g.selectAll(".tick line")
                .attr("stroke-opacity", 0.1)
            );

        // Add bars with custom colors and hover effects
        svg.selectAll(".bar")
            .data(processedData)
            .enter().append("rect")
            .attr("class", "bar")
            .attr("x", d => x(d.name))
            .attr("y", d => y(d.value))
            .attr("width", x.bandwidth())
            .attr("height", d => innerHeight - y(d.value))
            .attr("fill", (d, i) => colorPalette[i % colorPalette.length])
            .attr("stroke", "#fff")
            .attr("stroke-width", 1)
            .on("mouseover", function(event, d) {
                d3.select(this)
                    .attr("opacity", 0.8)
                
                tooltip.transition()
                    .duration(200)
                    .style("opacity", 0.9);
                
                tooltip.html(`
                    <strong>${d.name} год</strong><br>
                    ${d.value.toFixed(2)} ${d.currency}
                `)
                .style("left", (event.pageX + 15) + "px")
                .style("top", (event.pageY - 40) + "px");
            })
            .on("mouseout", function() {
                d3.select(this)
                    .attr("opacity", 1)
                    .attr("stroke", "#fff")
                    .attr("stroke-width", 1);
                
                tooltip.transition()
                    .duration(500)
                    .style("opacity", 0);
            });

        // Add X-axis with rotated labels
        svg.append("g")
            .attr("class", "x-axis")
            .attr("transform", `translate(0,${innerHeight})`)
            .call(d3.axisBottom(x))
            .selectAll("text")
            .attr("transform", "rotate(-35)")
            .style("text-anchor", "end")
            .attr("dx", "-.8em")
            .attr("dy", ".15em")
            .style("font-size", "10px");
    
        // Add chart title
        svg.append("text")
            .attr("x", innerWidth / 2 - 25)
            .attr("y", -13)
            .attr("text-anchor", "middle")
            .style("font-size", "16px")
            .style("font-weight", "bold")
            .text(`Дивиденды ${data[0].DIV_TICK} (${data[0].currencyid})`);

        // Add X-axis label
        svg.append("text")
            .attr("x", innerWidth / 2 - 30)
            .attr("y", innerHeight + margin.bottom - 40)
            .attr("text-anchor", "middle")
            .style("font-size", "12px")
            .text("Год");

    } else {
        const container = document.getElementById('additional_content');
        if (container) {
            container.innerHTML = "";
            container.textContent = "Нет данных о дивидендах для этой компании";
            container.style.textAlign = "center";
            container.style.fontSize = "16px";
            container.style.padding = "20px";
            container.style.color = "#666";
        }
    }
}

function addBrush(svg, data, width, height) {
    brush = d3.brushX()
        .extent([[config.volumeChart.margin.left, config.volumeChart.margin.top], 
                [width - config.volumeChart.margin.right, height - config.volumeChart.margin.bottom]])
        .on("brush end", brushed);

    svg.append("g")
        .attr("class", "brush")
        .call(brush);

    function brushed(event) {
        if (!event.selection) return;
        
        const [x0, x1] = event.selection;
        const date0 = xVolumeScale.invert(x0);
        const date1 = xVolumeScale.invert(x1);
        
        const filtered = allData.filter(d => d.begin >= date0 && d.begin <= date1);
        updateMainChart(filtered);
    }
}

function updateStructureCharts() {
    const selectedIndex = document.getElementById("index-select").value;
    const tickerData = processTickerData(selectedIndex);
    const sectorData = processSectorData(selectedIndex);
    
    const indexName = moexData.composition[selectedIndex]?.name || 
                     moexData.sectors[selectedIndex]?.name || 
                     selectedIndex;
                     
    if (tickerData.length > 0) {
        createPieChart(tickerData, "pie-chart", `${indexName} (состав портфеля)`, indexName);
    } else {
        d3.select("#pie-chart").html("<p>No ticker data available</p>");
    }
    
    if (sectorData.length > 0) {
        createBarChart(sectorData, "bar-chart", `${indexName} (отраслевая структура)`, indexName);
    } else {
        d3.select("#bar-chart").html("<p>No sector data available</p>");
    }
}

function processTickerData(index) {
    if (!moexData.composition[index] || !moexData.composition[index].composition) {
        console.warn(`No composition data for ${index}`);
        return [];
    }
    
    return Object.entries(moexData.composition[index].composition)
        .filter(([ticker]) => ticker !== "Others")
        .map(([ticker, weight]) => ({
            name: ticker,
            value: weight
        }));
}

function processSectorData(index) {
    if (!moexData.sectors || !moexData.sectors[index] || !moexData.sectors[index].sector_weights) {
        console.warn(`No sector data for ${index}`);
        return [];
    }

    return Object.entries(moexData.sectors[index].sector_weights)
        .map(([sector, weight]) => ({
            name: sector,
            value: parseFloat(weight) || 0 
        }))
        .filter(d => d.value > 0);
}

function createPieChart(data, containerId, title, indexName) {
    const container = d3.select(`#${containerId}`);
    container.selectAll("*").remove();
    
    const containerWidth = container.node().getBoundingClientRect().width;
    const width = containerWidth - 40;
    const height = 400;
    const radius = Math.min(width, height) / 2 - 40;

    const svg = container.append("svg")
        .attr("width", width)
        .attr("height", height)
        .append("g")
        .attr("transform", `translate(${width/2 - 50},${height/2})`);
    
    const pie = d3.pie().value(d => d.value);
    const arc = d3.arc().innerRadius(0).outerRadius(radius);
    
    const arcs = pie(data);

    const tooltip = d3.select("body").append("div")
    .attr("class", "tooltip")
    .style("opacity", 0)
    .style("position", "absolute")
    .style("background", "white")
    .style("border", "1px solid #ddd")
    .style("padding", "8px")
    .style("border-radius", "4px")
    .style("pointer-events", "none")
    .style("font-size", "12px");

    const colorPalette = [
        "#214517", // dark green
        "#9baf9f", // gray-green
        "#c62f2d", // red
        "#e5ac9d", // light pink
        "#638159", //light green
        "#cbc8c9" // very light gray
    ];
    
    svg.selectAll("path")
        .data(arcs)
        .enter().append("path")
        .attr("d", arc)
        .attr("fill", (d, i) => colorPalette[i % colorPalette.length])
        .attr("stroke", "white")
        .on("mouseover", function(event, d) {
            d3.select(this)
                .attr("opacity", 0.8)
            
            tooltip.transition()
                .duration(200)
                .style("opacity", 0.9);
            
            tooltip.html(`
                <strong>${d.data.name}</strong> ${d.data.value}%
            `)
            .style("left", (event.pageX + 15) + "px")
            .style("top", (event.pageY - 40) + "px");
        })
        .on("mouseout", function() {
            d3.select(this)
                .attr("opacity", 1)
                .attr("stroke", "#fff")
                .attr("stroke-width", 1);
            
            tooltip.transition()
                .duration(500)
                .style("opacity", 0);
        });
    
    svg.append("text")
        .attr("x", 30)
        .attr("y", -height/2 + 20)
        .attr("text-anchor", "middle")
        .text(title)
        .style("font-size", "16px")
        .style("font-weight", "bold");
    
    const legend = svg.selectAll(".legend")
    .data(data)
    .enter()
    .append("g")
    .attr("class", "legend")
    .attr("transform", (d, i) => `translate(${width/2 - 70},${-height/2 + 40 + i * 20})`);

    legend.append("rect")
    .attr("width", 16)
    .attr("height", 16)
    .attr("fill", (d, i) => colorPalette[i % colorPalette.length]);

    legend.append("text")
    .attr("x", 24)
    .attr("y", 12)
    .text(d => `${d.name} (${d.value}%)`)
    .style("font-size", "12px");
    }

function createBarChart(data, containerId, title, indexName) {

    const container = d3.select(`#${containerId}`);
    container.selectAll("*").remove();

    const containerWidth = container.node().getBoundingClientRect().width;
    const width = containerWidth - 40;
    const height = 400;
    const margin = {top: 40, right: 30, bottom: 100, left: 60};
    const innerWidth = width - margin.left - margin.right;
    const innerHeight = height - margin.top - margin.bottom;

    const tooltip = d3.select("body").append("div")
    .attr("class", "tooltip")
    .style("opacity", 0)
    .style("position", "absolute")
    .style("background", "white")
    .style("border", "1px solid #ddd")
    .style("padding", "8px")
    .style("border-radius", "4px")
    .style("pointer-events", "none");

    const colorPalette = [
        "#214517", // dark green
        "#9baf9f", // gray-green
        "#c62f2d", // red
        "#e5ac9d", // light pink
        "#638159", //light green
        "#cbc8c9" // very light gray
    ];

    const svg = container.append("svg")
        .attr("width", width)
        .attr("height", height)
        .append("g")
        .attr("transform", `translate(${margin.left},${margin.top})`);

    const validData = data.filter(d => 
        d.name && !isNaN(d.value) && d.value > 0
    );

    const x = d3.scaleBand()
        .domain(validData.map(d => d.name))
        .range([0, innerWidth])
        .padding(0.2);

    const y = d3.scaleLinear()
        .domain([0, d3.max(validData, d => d.value) * 1.1])
        .range([innerHeight, 0]);

    svg.append("g")
        .attr("class", "y-axis")
        .call(d3.axisLeft(y)
            .tickSize(-innerWidth) // Add grid lines across width
            .tickFormat(d => `${d} %`)
        )
        .call(g => g.select(".domain").remove()) // Remove axis line
        .call(g => g.selectAll(".tick line")
            .attr("stroke-opacity", 0.1) // Make grid lines subtle
        );

    svg.selectAll(".bar")
        .data(validData)
        .enter().append("rect")
        .attr("class", "bar")
        .attr("x", d => x(d.name))
        .attr("y", d => y(d.value))
        .attr("width", x.bandwidth())
        .attr("height", d => innerHeight - y(d.value))
        .attr("fill", (d, i) => colorPalette[i % colorPalette.length])
        .on("mouseover", function(event, d) {
            d3.select(this).attr("opacity", 0.8);
            tooltip.transition()
                .duration(200)
                .style("opacity", .9);
            tooltip.html(`<strong>${d.name}</strong> ${d.value}%`)
                .style("left", (event.pageX + 10) + "px")
                .style("top", (event.pageY - 28) + "px");
        })
        .on("mouseout", function() {
            d3.select(this).attr("opacity", 1);
            tooltip.transition()
                .duration(500)
                .style("opacity", 0);
        });

    svg.append("g")
        .attr("transform", `translate(0,${innerHeight})`)
        .call(d3.axisBottom(x))
        .selectAll("text")
        .attr("transform", "rotate(-45)")
        .attr("text-anchor", "end")
        .attr("dx", "-.8em")
        .attr("dy", ".15em")
        .style("font-size", "10px");

    svg.append("text")
        .attr("x", 220)
        .attr("y", -20)
        .attr("text-anchor", "middle")
        .text(title)
        .style("font-size", "16px")
        .style("font-weight", "bold");

    const legend = svg.selectAll(".legend")
    .data(validData)
    .enter()
    .append("g")
    .attr("class", "legend")
    .attr("transform", (d, i) => `translate(${innerWidth - 200},${20 + i * 20})`);

    legend.append("rect")
    .attr("width", 16)
    .attr("height", 16)
    .attr("x", -20)
    .attr("y", -30)
    .attr("fill", (d, i) => colorPalette[i % colorPalette.length])

    legend.append("text")
    .attr("x", 5)
    .attr("y", -20)
    .text(d => `${d.name} (${d.value.toFixed(1)}%)`)
    .style("font-size", "12px");
}

const tooltip = d3.select("body").append("div")
    .attr("class", "tooltip")
    .style("opacity", 0);

document.getElementById("index-select").addEventListener("change", updateStructureCharts);

function updateMainChart(filteredData) {
    this.filteredData = filteredData;

    xMainScale.domain(d3.extent(filteredData, d => d.begin));
    yMainScale.domain([d3.min(filteredData, d => d.low) * 0.99, 
                      d3.max(filteredData, d => d.high) * 1.01]);

    const mainSvg = d3.select("#main-chart svg");
    const width = document.getElementById('chart-container').clientWidth - 20;
    
    const xAxis = d3.axisBottom(xMainScale)
        .tickFormat(d3.timeFormat("%b %Y"))
        .tickValues(adjustXTicks(xMainScale, width - config.mainChart.margin.left - config.mainChart.margin.right));
    
    xMainScale.domain(d3.extent(filteredData, d => d.begin));
    yMainScale.domain([d3.min(filteredData, d => d.low) * 0.99, 
                      d3.max(filteredData, d => d.high) * 1.01]);


    mainSvg.select(".x-axis")
        .call(xAxis);

    mainSvg.select(".y-axis")
        .call(d3.axisLeft(yMainScale));

    const candles = mainSvg.selectAll(".candle")
        .data(filteredData);

    candles.exit().remove();


    candles.attr("transform", d => `translate(${xMainScale(d.begin)},0)`)
        .select("rect")
        .attr("y", d => d.type === 'bullish' ? yMainScale(d.close) : yMainScale(d.open))
        .attr("height", d => Math.abs(yMainScale(d.open) - yMainScale(d.close)));

    candles.select("line")
        .attr("y1", d => yMainScale(d.high))
        .attr("y2", d => yMainScale(d.low));

    candles.enter()
        .append("g")
        .attr("class", "candle")
        .attr("transform", d => `translate(${xMainScale(d.begin)},0)`)
        .each(function(d) {
            const g = d3.select(this);
            const candleWidth = config.mainChart.candleWidth;
            const halfWidth = candleWidth / 2;
            
            g.append("rect")
                .attr("x", -halfWidth)
                .attr("y", d.type === 'bullish' ? yMainScale(d.close) : yMainScale(d.open))
                .attr("width", candleWidth)
                .attr("height", Math.abs(yMainScale(d.open) - yMainScale(d.close)))
                .attr("fill", d.type === 'bullish' ? '#436239' : '#c62f2d');
            
            g.append("line")
                .attr("x1", 0)
                .attr("x2", 0)
                .attr("y1", yMainScale(d.high))
                .attr("y2", yMainScale(d.low))
                .attr("stroke", d.type === 'bullish' ? '#436239' : '#c62f2d')
                .attr("stroke-width", 1);
        });
}

function setupPeriodButtons() {
    d3.selectAll(".period-btn").on("click", function() {
        d3.selectAll(".period-btn").classed("active", false);
        d3.select(this).classed("active", true);
        filterDataByPeriod(this.dataset.period);
    });
}

function filterDataByPeriod(period) {
    let filtered = [...allData];
    const lastDate = new Date(allData[allData.length - 1].begin);
    
    if (period === "month") {
        const monthAgo = new Date(lastDate);
        monthAgo.setMonth(monthAgo.getMonth() - 1);
        filtered = allData.filter(d => d.begin >= monthAgo);
    } 
    else if (period === "year") {
        const yearAgo = new Date(lastDate);
        yearAgo.setFullYear(yearAgo.getFullYear() - 1);
        filtered = allData.filter(d => d.begin >= yearAgo);
    }
    
    updateChartsWithData(filtered);
}

function updateChartsWithData(data) {
    filteredData = data;
    updateMainChart(data);
    
    if (brush) {
        d3.select("#volume-chart svg .brush").call(brush.move, null);
    }
}

document.addEventListener('DOMContentLoaded', initApp);

function createOpenPriceChart(tickerName) {
    currentTicker = tickerName;
    let tickerData = allData.filter(item => item.STOCK_TICK === tickerName);
    let indData = allDataIndex.filter(item => item.INDEX_TICK === tickerName);

    tickerData = [
        ...tickerData.map(item => ({ ...item, dataType: 'stock' })),
        ...indData.map(item => ({ ...item, dataType: 'index' }))
      ];

    const mainContainer = d3.select("#open-price-chart-container");
    mainContainer.selectAll("*").remove();

    setupFilterControls(tickerName);

    const initialFilter = tickerSets.indices.includes(tickerName) ? "indices" : "stocks";
    d3.select(`#open-price-chart-container #${initialFilter}-filter`).classed("active", true);
    
    updateOpenPriceChartTickerButtons(initialFilter);

    mainContainer
        .style("display", "flex")
        .style("flex-direction", "column") 
        .style("gap", "20px");

    if (tickerData.length === 0) {
        mainContainer.append("p").text(`Нет данных для ${tickerName}`);
        return;
    }

    const chartContent = mainContainer.append("div")
        .style("display", "flex")
        .style("gap", "20px");
    

    const container = mainContainer.append("div")
        .attr("class", "chart-main-content")
        .style("flex-grow", "1");

    const controls = container.append("div")
        .attr("class", "chart-controls")
        .style("margin-bottom", "10px")
        .style("display", "flex")
        .style("gap", "10px");

    const priceTypes = [
        {value: "open", label: "Открытие"},
        {value: "close", label: "Закрытие"},
        {value: "high", label: "Максимум"},
        {value: "low", label: "Минимум"}
    ];

    controls.append("div")
        .attr("class", "price-type-control")
        .style("display", "flex")
        .style("align-items", "center")
        .html(`
            <span style="margin-right: 10px;">Тип цены:</span>
            <select id="price-type-select" class="chart-select">
                ${priceTypes.map(t => `<option value="${t.value}">${t.label}</option>`).join("")}
            </select>
        `);

    const periods = [
        {value: "5y", label: "5 лет", days: 365*5},
        {value: "1y", label: "1 год", days: 365},
        {value: "6m", label: "6 месяцев", days: 180},
        {value: "1m", label: "1 месяц", days: 30},
        {value: "1w", label: "1 неделя", days: 7}
    ];

    controls.append("div")
        .attr("class", "period-control")
        .style("display", "flex")
        .style("align-items", "center")
        .html(`
            <span style="margin-right: 10px;">Период:</span>
            <select id="period-select" class="chart-select">
                ${periods.map(p => `<option value="${p.value}">${p.label}</option>`).join("")}
            </select>
        `);

    let currentPriceType = "open";
    let currentPeriod = "5y";

    const width = container.node().getBoundingClientRect().width - 300
    const height = 310;
    const margin = {top: 50, right: 100, bottom: 0, left: 150};
    const innerWidth = width;
    const innerHeight = height;

    const svg = container.append("svg")
        .attr("width", width)
        .attr("height", height)
        .append("g")
        .attr("transform", `translate(${margin.left},${margin.top})`);

    const x = d3.scaleTime().range([0, innerWidth]);
    const y = d3.scaleLinear().range([innerHeight, 0]);

    const line = d3.line()
        .x(d => x(d.begin))
        .curve(d3.curveMonotoneX);

    const path = svg.append("path")
        .attr("class", "price-line")
        .attr("fill", "none")
        .attr("stroke", "#214517")
        .attr("stroke-width", 2);

    const focus = svg.append("g")
        .attr("class", "focus")
        .style("display", "none");

    focus.append("circle")
        .attr("r", 5)
        .attr("fill", "#e5ac9d")
        .attr("stroke", "white")
        .attr("stroke-width", 2);

    focus.append("text")
        .attr("class", "tooltip-text")
        .attr("x", 10)
        .attr("dy", "0.35em");

    svg.append("rect")
        .attr("class", "overlay")
        .attr("width", innerWidth)
        .attr("height", innerHeight)
        .style("fill", "none")
        .style("pointer-events", "all")
        .on("mouseover", () => focus.style("display", null))
        .on("mouseout", () => focus.style("display", "none"))
        .on("mousemove", mousemove);

    const xAxis = svg.append("g")
        .attr("class", "x-axis")
        .attr("transform", `translate(0,${innerHeight})`);

    const yAxis = svg.append("g")
        .attr("class", "y-axis");

    const title = svg.append("text")
        .attr("x", innerWidth / 2)
        .attr("y", -10)
        .attr("text-anchor", "middle")
        .style("font-size", "16px")
        .style("font-weight", "bold");

    svg.append("text")
        .attr("class", "x-axis-label")
        .attr("x", innerWidth / 2)
        .attr("y", innerHeight + 35)
        .attr("text-anchor", "middle")
        .text("Дата");

    const yAxisLabel = svg.append("text")
        .attr("class", "y-axis-label")
        .attr("transform", "rotate(-90)")
        .attr("x", -innerHeight / 2)
        .attr("y", -50)
        .attr("text-anchor", "middle");

    d3.select("#price-type-select").on("change", function() {
        currentPriceType = this.value;
        updateChart();
    });

    d3.select("#period-select").on("change", function() {
        currentPeriod = this.value;
        updateChart();
    });

    updateChart();

    function updateChart() {
        const periodData = filterByPeriodEx(tickerData, currentPeriod);
        
        x.domain(d3.extent(periodData, d => d.begin));
        y.domain([d3.min(periodData, d => d[currentPriceType]) * 0.99, 
                    d3.max(periodData, d => d[currentPriceType]) * 1.01]);

        line.y(d => y(d[currentPriceType]));

        path.datum(periodData)
            .transition()
            .duration(500)
            .attr("d", line);

        let xAxisFormatter;
        let tickValues;
        
        if (currentPeriod === "1w") {
            xAxisFormatter = d3.axisBottom(x)
                .tickFormat(d3.timeFormat("%a %d.%m"));
            
            tickValues = d3.timeDays(
                d3.timeDay.floor(x.domain()[0]), 
                d3.timeDay.ceil(x.domain()[1])
            );
            
        } else if (currentPeriod === "1m") {
            xAxisFormatter = d3.axisBottom(x)
                .tickFormat(d3.timeFormat("%d.%m"));
            
            const daysInRange = d3.timeDay.count(
                d3.timeDay.floor(x.domain()[0]), 
                d3.timeDay.ceil(x.domain()[1])
            );
            const tickInterval = Math.max(1, Math.floor(daysInRange / 7));
            
            tickValues = d3.timeDays(
                d3.timeDay.floor(x.domain()[0]), 
                d3.timeDay.ceil(x.domain()[1]),
                tickInterval
            );
            
        } else {
            xAxisFormatter = d3.axisBottom(x)
                .tickFormat(d3.timeFormat("%b %Y"));
        }

        xAxis.transition().duration(500)
            .call(tickValues ? xAxisFormatter.tickValues(tickValues) : xAxisFormatter);
        
        yAxis.transition().duration(500)
            .call(d3.axisLeft(y));

        const priceLabels = {
            open: "Цена открытия (руб.)",
            close: "Цена закрытия (руб.)",
            high: "Максимальная цена (руб.)",
            low: "Минимальная цена (руб.)"
        };
        
        title.text(`${priceLabels[currentPriceType]} для ${tickerName}`);
        yAxisLabel.text(priceLabels[currentPriceType]);
    }

    function filterByPeriodEx(data, period) {
        if (period === "all" || data.length === 0) return data;
        
        const lastDate = new Date(data[data.length - 1].begin);
        const days = periods.find(p => p.value === period)?.days || 365;
        
        const cutoffDate = new Date(lastDate);
        cutoffDate.setDate(cutoffDate.getDate() - days);
        
        return data.filter(d => new Date(d.begin) >= cutoffDate);
    }

    function mousemove(event) {
        const periodData = filterByPeriodEx(tickerData, currentPeriod);
        const x0 = x.invert(d3.pointer(event)[0]);
        const i = bisectDate(periodData, x0, 1);
        const d0 = periodData[i - 1];
        const d1 = periodData[i];
        const d = x0 - d0.begin > d1.begin - x0 ? d1 : d0;
        
        const formattedDate = formatDate(d.begin);
        const priceLabels = {
            open: "Открытие",
            close: "Закрытие", 
            high: "Максимум",
            low: "Минимум"
        };
        
        focus.attr("transform", `translate(${x(d.begin)},${y(d[currentPriceType])})`);
        
        const tooltipText = focus.select("text.tooltip-text")
            .html("");
        
        tooltipText.selectAll("tspan")
            .data([
                `${priceLabels[currentPriceType]} ${formattedDate}:`,
                `${d[currentPriceType].toFixed(2)}`
            ])
            .enter()
            .append("tspan")
            .attr("x", 10)
            .attr("dy", (d, i) => i ? "1.2em" : 0)
            .text(d => d);
    }

    const bisectDate = d3.bisector(d => d.begin).left;

    function formatDate(date) {
        const d = new Date(date);
        const day = String(d.getDate()).padStart(2, '0');
        const month = String(d.getMonth() + 1).padStart(2, '0');
        const year = d.getFullYear();
        return `${day}.${month}.${year}`;
    }
}

function setupFilterControls(tickerName) {
    const chartContainer = document.getElementById('open-price-chart-container');
    
    const filterContainer = document.createElement("div");
    const isInd = tickerSets.indices.includes(tickerName);
    const initialFilter = isInd ? "indices" : "stocks";
    filterContainer.className = "filter-container";
    filterContainer.style.margin = "10px 0";
    filterContainer.style.display = "flex";
    filterContainer.style.alignItems = "center";
    filterContainer.style.gap = "10px";

    filterContainer.innerHTML = `
        <span>Показать:</span>
        <button id="stocks-filter" class="filter-btn ${!isInd ? 'active' : ''}">Акции</button>
        <button id="indices-filter" class="filter-btn ${isInd? 'active' : ''}">Индексы</button>
        <div id="ticker-buttons" class="ticker-buttons"></div>
    `;

    chartContainer.insertBefore(filterContainer, chartContainer.firstChild);

    document.getElementById("stocks-filter").addEventListener("click", () => {
        handleOpenPriceChartFilter("stocks");
    });
    document.getElementById("indices-filter").addEventListener("click", () => {
        handleOpenPriceChartFilter("indices");
    });

    filterContainer.dataset.currentFilter = initialFilter;
    
    updateOpenPriceChartTickerButtons(initialFilter);
}

function handleOpenPriceChartFilter(type) {
    d3.selectAll('#open-price-chart-container .filter-btn')
        .classed("active", function() {
            return this.id === `${type}-filter`;
        });
    
    updateOpenPriceChartTickerButtons(type);
    
    document.querySelector('#open-price-chart-container .filter-container')
        .dataset.currentFilter = type;
}

function updateOpenPriceChartTickerButtons(type) {
    const buttonsContainer = document.querySelector('#open-price-chart-container #ticker-buttons');
    buttonsContainer.innerHTML = "";
    
    const tickers = type === "stocks" ? 
        tickerSets.stocks : tickerSets.indices;
    
    d3.select(buttonsContainer)
        .selectAll(".ticker-btn")
        .data(tickers)
        .enter()
        .append("button")
        .attr("class", "ticker-btn")
        .style("width", "100px")
        .html(d => `
            <span class="ticker-name">${d}</span>
            <div class="ticker-hover-info">
                <span class="price-change"></span>
                <span class="open-price"></span>
            </div>
        `)
        .classed("active", d => d === currentTicker)
        .on("mouseover", function(event, ticker) {
            showTickerPriceInfo(this, ticker);
        })
        .on("mouseout", function() {
            d3.select(this).select(".ticker-hover-info")
                .style("opacity", 0);
        })
        .on("click", function(event, ticker) {
            d3.selectAll("#open-price-chart-container .ticker-btn")
                .classed("active", false);
            d3.select(this).classed("active", true);
            
            loadData(ticker).then(() => {
                createOpenPriceChart(ticker);
            });
        });
}

function showTickerPriceInfo(buttonElement, ticker) {
    const dataset = tickerSets.stocks.includes(ticker) ? allData : allDataIndex;
    const tickerData = dataset.filter(d => 
        (d.STOCK_TICK === ticker || d.INDEX_TICK === ticker) && 
        d.period === 'D'
    );
    
    if (tickerData.length === 0) return;
    
    const latestData = tickerData[tickerData.length - 1];
    const prevClose = tickerData.length > 1 ? 
        tickerData[tickerData.length - 2].close : latestData.open;
        console.log(prevClose)
    console.log(prevClose)
    const change = latestData.close - prevClose;
    const changePercent = (change / prevClose * 100).toFixed(2);
    
    const hoverInfo = d3.select(buttonElement).select(".ticker-hover-info");
    
    hoverInfo.select(".price-change")
        .text(`${change >= 0 ? '+' : ''}${change.toFixed(2)} (${changePercent}%)`)
        .classed("positive", change >= 0)
        .classed("negative", change < 0);
        
    hoverInfo.select(".open-price")
        .text(`Open: ${latestData.open.toFixed(2)}`);
    
    hoverInfo.style("opacity", 1);
}

function updateTickerButtons(type) {
    const buttonsContainer = document.getElementById("ticker-buttons");
    buttonsContainer.innerHTML = "";
    
    tickerSets[type].forEach(ticker => {
        const btn = document.createElement("button");
        btn.className = "ticker-btn";
        btn.textContent = ticker;
        btn.addEventListener("click", () => {
            loadData(ticker).then(() => {
                createCombinedCharts(filteredData, ticker);
                createDividend(filter_dividends);
                createOpenPriceChart(ticker);
            });
        });
        buttonsContainer.appendChild(btn);
    });
}