//General constants
const config = {
    defaultTicker: 'SBER',
    mainChart: {
        height: 430,
        margin: { top: 40, right: 40, bottom: 30, left: 60 },
        candleWidth: 2
    },
    volumeChart: {
        height: 180,
        margin: { top: 30, right: 40, bottom: 40, left: 90 }
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
let brush;
let currentTicker = config.defaultTicker;
let tickerMap = {};
let tickerInfo = {};
let IndexMap = {};
let moexData = {
    composition: {},
    sectors: {}
};

let xMainScale, yMainScale, xVolumeScale, yVolumeScale;
const INDEX_TICKERS = ['IMOEX', 'IMOEX2', 'RTSI', 'IMOEXCNY', 'MOEXBC', 'MOEXOG', 'MOEXEU', 'MOEXTL', 'MOEXMM', 'MOEXFN'];
let colorScale = d3.scaleOrdinal(d3.schemeTableau10);
let structureTooltip = d3.select("body").append("div")
    .attr("class", "tooltip")
    .style("opacity", 0);
const tickerSets = {
    stocks: ["SBER", "GAZP", "GMKN", "MTSS", "RNFT", "LKOH", "PLZL", "VTBR", "IRAO", "TATN"],
    indices: INDEX_TICKERS
}


//Initializes the application by setting up UI, loading data, and creating charts
async function initApp() {
    setupUI();
    await loadData(currentTicker);
    await loadIndexData();
    createCombinedCharts(filteredData, currentTicker);
    addTooltip();
    createDividend(filter_dividends);
    createOpenPriceChart(currentTicker);
    setupPeriodButtons(); 
}


//Loads data for a specific ticker from the server
//@param {string} ticker - The ticker symbol to load data for
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
        if (allData.length ===0){
            filteredData = [... prepareData(allDataIndex)]
        }
        filterIndex = [... prepareData(allDataIndex)]
        const divData = await fetchData('dividend');
        dividends = divData.filter(item => item.DIV_TICK === ticker);
        filter_dividends = [...dividends];
        currentTicker = ticker;
        fetchData('dictionary');
        fetchData('tickerDescr')
}

//Loads index composition and sector data from the server
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

//Fetches data from the server based on type
//@param {string} type - The type of data to fetch ('dictionary', 'tickerDescr', etc.)
//@returns {Promise} A promise that resolves with the fetched data
async function fetchData(type) {
    if (type === "dictionary") {
        const [tickerResponse, indexResponse] = await Promise.all([
            fetch('http://localhost:5500/api/data/dictionary'),
            fetch('http://localhost:5500/api/data/Index_dictionary')
        ]);

        if (!tickerResponse.ok || !indexResponse.ok) {
            throw new Error(`HTTP error! Status: ${tickerResponse.status}, ${indexResponse.status}`);
        }

        tickerMap = await tickerResponse.json();
        IndexMap = await indexResponse.json();

        initAutocomplete();
    } else if (type === "tickerDescr") {
        fetch('http://localhost:5500/api/data/tickerDescr')
        .then(response => response.json())
        .then(data => {
            tickerInfo = data.tickers;
        });
    } else {
        const response = await fetch(`http://localhost:5500/api/data/${type}`);
        if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
        return await response.json();
    }
}

//Sets up the user interface including search input and period selector
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
        <button class="period-btn" data-period="month">Месяц</button>
        <button class="period-btn" data-period="year">Год</button>
        <button class="period-btn active" data-period="all">Все данные</button>
    `;
    document.getElementById('chart-container').appendChild(periodSelector);
}

//Initializes the autocomplete functionality for the search input
function initAutocomplete() {
    const datalist = document.getElementById('tickerSuggestions');
    datalist.innerHTML = ''
    const allOptions = Array.from(
         new Set([
             ...Object.keys(tickerMap), 
             ...Object.values(tickerMap),
             ...Object.keys(IndexMap), 
             ...Object.values(IndexMap)
        ])
    );
      
    allOptions.forEach(item => {
      const option = document.createElement('option');
      option.value = item;
      datalist.appendChild(option);
    });
}

//Handles the search for a ticker and updates the charts accordingly
function searchTicker() {
    const input = document.getElementById('tickerInput').value.trim();
    if (!input) return;

    const upperInput = input.toUpperCase();

    const foundTicker = Object.values(tickerMap).find(ticker => 
        ticker.toUpperCase() === upperInput
    );

    const foundIndexTicker = Object.keys(IndexMap).find(ticker =>
        ticker.toUpperCase() === upperInput
    );

    const foundCompany = Object.keys(tickerMap).find(company => 
        company.toUpperCase().includes(upperInput)
    );

    const foundIndexName = Object.entries(IndexMap).find(([ticker, name]) => 
        name.toUpperCase().includes(upperInput)
    );

    if (foundTicker) {
        loadData(foundTicker).then(() => {
            createCombinedCharts(filteredData, foundTicker);
            addTooltip();
            createDividend(filter_dividends);
            createOpenPriceChart(foundTicker);
            showRelevantView("stocks");
        });
        return;
    }
    else if (foundIndexTicker) {
        currentTicker = IndexMap[foundIndexTicker];
        loadData(currentTicker).then(() => {
            d3.select("#main-chart").html("");
            d3.select("#volume-chart").html("");
            createCombinedCharts(filterIndex, currentTicker);
            addTooltip();
            createOpenPriceChart(currentTicker);
            showRelevantView("indexes");
            updateStructureCharts(currentTicker);
        });
        return;
    }
    else if (foundCompany) {
        const ticker = tickerMap[foundCompany];
        loadData(ticker).then(() => {
            createCombinedCharts(filteredData, ticker);
            addTooltip();
            createDividend(filter_dividends);
            createOpenPriceChart(ticker);
            showRelevantView("stocks");
        });
    }
    else if (foundIndexName) {
        const ticker = foundIndexName[1];
        currentTicker = ticker;
        loadData(ticker).then(() => {
            d3.select("#main-chart").html("");
            d3.select("#volume-chart").html("");
            createCombinedCharts(filterIndex, ticker);
            addTooltip();
            createOpenPriceChart(ticker);
            showRelevantView("indexes");
            updateStructureCharts(ticker);
        });
    }
    else {
        showToast("К сожалению, тикер с таким названием не был найден");
    }
}

//Prepares and validates the data for charting
//@param {Array} data - The raw data to prepare
//@returns {Array} The prepared and validated data
function prepareData(data) {
    if (!Array.isArray(data)) {
        console.error("Invalid data format - expected array!");
        return [];
    }

    return data.map(d => {
        try {
            const beginDate = new Date(d.begin);
            if (isNaN(beginDate.getTime())) {
                console.warn("Invalid date:", d.begin);
                return null;
            }

            return {
                begin: beginDate,
                open: +d.open || 0,
                close: +d.close || 0,
                high: +d.high || 0,
                low: +d.low || 0,
                volume: +d.volume || 0,
                value: +d.value || 0,
                type: (+d.close || 0) >= (+d.open || 0) ? 'bullish' : 'bearish',
                ticker: d.STOCK_TICK || d.INDEX_TICK || 'UNKNOWN'
            };
        } catch (error) {
            console.error("Error processing data item:", d, error);
            return null;
        }
    }).filter(item => item !== null);
}

//Sets up scales for the charts based on the data
//@param {Array} data - The chart data
//@param {number} width - The width of the chart
//@param {number} mainHeight - The height of the main chart
//@param {number} volumeHeight - The height of the volume chart

function setupScales(data, width, mainHeight, volumeHeight) {
    if (!data || data.length === 0) return;
    
    const mainMargin = config.mainChart.margin;
    const volumeMargin = config.volumeChart.margin;
    
    const dateExtent = d3.extent(data, d => d.begin);
    xMainScale = d3.scaleTime()
        .domain(dateExtent)
        .range([mainMargin.left, width - mainMargin.right]);
    
    xVolumeScale = d3.scaleTime()
        .domain(dateExtent)
        .range([volumeMargin.left, width - volumeMargin.right]);

    const pricePadding = 0.01;
    const priceExtent = [
        d3.min(data, d => d.low) * (1 - pricePadding),
        d3.max(data, d => d.high) * (1 + pricePadding)
    ];
    yMainScale = d3.scaleLinear()
        .domain(priceExtent)
        .range([mainHeight - mainMargin.bottom, mainMargin.top]);

    const maxVolumeValue = d3.max(data, d => d.volume || d.value || 0);
    const volumePadding = 0.1;
    yVolumeScale = d3.scaleLinear()
        .domain([0, maxVolumeValue * (1 + volumePadding)])
        .range([volumeHeight - volumeMargin.bottom, volumeMargin.top]);
}

//Adjusts the number of x-axis ticks based on chart width
//@param {Object} scale - The d3 scale object
//@param {number} width - The width of the chart
//@returns {Array} The adjusted tick values
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

//Adds a tooltip to the main chart
function addTooltip() {
    d3.select("#main-chart .chart-tooltip").remove();
    d3.select("#main-chart svg .tooltip-line").remove();
    d3.select("#main-chart svg .mouse-tracker").remove();

    const svg = d3.select("#main-chart svg");
    const margin = config.mainChart.margin;
    const width = +svg.attr("width");
    const height = +svg.attr("height");
    
    const tooltip = d3.select("#main-chart")
        .append("div")
        .attr("class", "chart-tooltip")
        .style("position", "absolute")
        .style("visibility", "hidden")
        .style("background", "#fff")
        .style("border", "1px solid #ddd")
        .style("border-radius", "4px")
        .style("padding", "8px 12px")
        .style("font-size", "12px")
        .style("box-shadow", "0 2px 4px rgba(0,0,0,0.1)")
        .style("pointer-events", "none")
        .style("z-index", "10");

    const tooltipLine = svg.append("line")
        .attr("class", "tooltip-line")
        .attr("stroke", "#666")
        .attr("stroke-width", 1)
        .attr("stroke-dasharray", "3,3")
        .style("opacity", 0);

    const chartArea = {
        x1: margin.left,
        x2: width - margin.right,
        y1: margin.top,
        y2: height - margin.bottom
    };

    svg.append("rect")
        .attr("class", "mouse-tracker")
        .attr("x", chartArea.x1)
        .attr("y", chartArea.y1)
        .attr("width", chartArea.x2 - chartArea.x1)
        .attr("height", chartArea.y2 - chartArea.y1)
        .style("opacity", 0)
        .style("pointer-events", "all")
        .on("mouseover", function() {
            tooltip.style("visibility", "visible");
            tooltipLine.style("opacity", 1);
        })
        .on("mousemove", function(event) {
            if (window.isDragging) return;
            
            const [x, y] = d3.pointer(event, this);
            const date = xMainScale.invert(x);
            
            const bisect = d3.bisector(d => d.begin).left;
            const idx = bisect(filteredData, date, 1);
            const d = filteredData[idx - 1] || filteredData[idx];
            
            if (!d) return;
            
            d3.selectAll(".candle")
                .select("rect")
                .style("stroke", "none");
            
            d3.selectAll(".candle")
                .filter(candle => candle.begin.getTime() === d.begin.getTime())
                .select("rect")
                .style("stroke", "#000")
                .style("stroke-width", "1px");

            const xPos = xMainScale(d.begin);
            tooltipLine
                .attr("x1", xPos)
                .attr("x2", xPos)
                .attr("y1", 0)
                .attr("y2", height);
            if (d.volume != 0){
            tooltip.html(`
                <div><strong>${d3.timeFormat("%d %b %Y")(d.begin)}</strong></div>
                <div style="margin-top: 6px;">
                    <div>Открытие: <strong>${d.open.toFixed(2)}</strong></div>
                    <div>Закрытие: <strong>${d.close.toFixed(2)}</strong></div>
                    <div>Максимум: <strong>${d.high.toFixed(2)}</strong></div>
                    <div>Минимум: <strong>${d.low.toFixed(2)}</strong></div>
                    <div>Объем: <strong>${d.volume.toLocaleString()}</strong></div>
                </div>
            `)
            .style("left", (event.pageX + 10) + "px")
            .style("top", (event.pageY - 10) + "px");
            }else{
                tooltip.html(`
                    <div><strong>${d3.timeFormat("%d %b %Y")(d.begin)}</strong></div>
                    <div style="margin-top: 6px;">
                        <div>Открытие: <strong>${d.open.toFixed(2)}</strong></div>
                        <div>Закрытие: <strong>${d.close.toFixed(2)}</strong></div>
                        <div>Максимум: <strong>${d.high.toFixed(2)}</strong></div>
                        <div>Минимум: <strong>${d.low.toFixed(2)}</strong></div>
                        <div>Объем в рублях: <strong>${d.value.toLocaleString()}</strong></div>
                    </div>
                `)
                .style("left", (event.pageX + 10) + "px")
                .style("top", (event.pageY - 10) + "px");
            }
        })
        .on("mouseout", function() {
            tooltip.style("visibility", "hidden");
            tooltipLine.style("opacity", 0);
            d3.selectAll(".candle rect")
                .style("stroke", "none");
        });
}

//Creates combined candlestick and volume charts
//@param {Array} data - The data to display in the charts
//@param {string} ticker - The ticker symbol being displayed
function createCombinedCharts(data, ticker) {
    if (!data || data.length === 0) {
        console.error("No data provided to create charts!");
        return;
    }

    filteredData = prepareData(data);
    if (filteredData.length === 0) {
        console.error("Failed to prepare data for charts!");
        return;
    }

    const mainChartContainer = document.getElementById('main-chart');
    const volumeChartContainer = document.getElementById('volume-chart');
    if (!mainChartContainer || !volumeChartContainer) {
        console.error("Chart containers not found!");
        return;
    }

    const container = document.getElementById('chart-container');
    if (!container) {
        console.error("Main container not found!");
        return;
    }
    const width = container.clientWidth - 70;
    
    const mainHeight = config.mainChart.height;
    const volumeHeight = config.volumeChart.height;

    d3.select("#main-chart").html("");
    d3.select("#volume-chart").html("");

    try {
        const mainSvg = d3.select("#main-chart")
            .append("svg")
            .attr("width", width)
            .attr("height", mainHeight);
        const volumeSvg = d3.select("#volume-chart")
            .append("svg")
            .attr("width", width)
            .attr("height", volumeHeight);

        setupScales(filteredData, width, mainHeight, volumeHeight);
        
        createCandlestickChart(mainSvg, filteredData, width, mainHeight, ticker);
        createVolumeChart(volumeSvg, filteredData, width, volumeHeight);
        addTooltip(); 
    } catch (error) {
        console.error("Error while creating charts:", error);
    }
}

//Creates a candlestick chart
//@param {Object} svg - The d3 SVG element to draw the chart in
//@param {Array} data - The data to display
//@param {number} width - The width of the chart
//@param {number} height - The height of the chart
//@param {string} ticker - The ticker symbol being displayed
function createCandlestickChart(svg, data, width, height, ticker) {
    svg.selectAll("*").remove();

    const xOriginal = xMainScale.copy();
    const yOriginal = yMainScale.copy();

    svg.append("defs").append("clipPath")
        .attr("id", "chart-clip")
        .append("rect")
        .attr("width", width - config.mainChart.margin.left - config.mainChart.margin.right)
        .attr("height", height - config.mainChart.margin.top - config.mainChart.margin.bottom)
        .attr("x", config.mainChart.margin.left)
        .attr("y", config.mainChart.margin.top);

    const chartGroup = svg.append("g")
        .attr("class", "chart-group")
        .attr("clip-path", "url(#chart-clip)");

    const candles = chartGroup.selectAll(".candle")
        .data(data)
        .enter().append("g")
        .attr("class", "candle")
        .attr("transform", d => `translate(${xMainScale(d.begin)},0)`);

    candles.each(function(d) {
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

    const xAxis = svg.append("g")
        .attr("class", "x-axis")
        .attr("transform", `translate(0,${height - config.mainChart.margin.bottom})`);

    const yAxis = svg.append("g")
        .attr("class", "y-axis")
        .attr("transform", `translate(${config.mainChart.margin.left},0)`);
    const company = tickerInfo.filter(d => d.ticker === ticker);
    svg.append("text")
        .attr("x", width / 2)
        .attr("y", config.mainChart.margin.top / 2 + 12)
        .attr("text-anchor", "middle")
        .style("font-size", "18px")
        .style("font-weight", "700")
        .text(`${`${company[0].name} (${company[0].ticker})`} - Свечной график`);

    const zoom = d3.zoom()
        .scaleExtent([1, 20])
        .translateExtent([[0, 0], [width, height]])
        .on("zoom", (event) => {
            const newX = event.transform.rescaleX(xOriginal);
            const newY = event.transform.rescaleY(yOriginal);

            xMainScale.domain(newX.domain());
            yMainScale.domain(newY.domain());

            candles.attr("transform", d => `translate(${xMainScale(d.begin)},0)`);
            candles.selectAll("rect")
                .attr("y", d => d.type === 'bullish' ? yMainScale(d.close) : yMainScale(d.open))
                .attr("height", d => Math.abs(yMainScale(d.open) - yMainScale(d.close)));
            
            candles.selectAll("line")
                .attr("y1", d => yMainScale(d.high))
                .attr("y2", d => yMainScale(d.low));

            updateAxes();
        });

    svg.call(zoom);

    updateAxes();

    function updateAxes() {
        xAxis.call(d3.axisBottom(xMainScale)
            .tickFormat(d3.timeFormat("%b %Y"))
            .tickValues(adjustXTicks(xMainScale, width - config.mainChart.margin.left - config.mainChart.margin.right)));
        
        yAxis.call(d3.axisLeft(yMainScale));
    }

    const resetButton = svg.append("g")
    .attr("class", "zoom-reset")
    .attr("transform", `translate(${width - 100},20)`)
    .style("cursor", "pointer")
    .on("mouseover", function() {
        resetButton.select("rect")
            .attr("fill", "#7a9a7f");
        resetButton.select("text")
            .attr("font-weight", "bold");
    })
    .on("mouseout", function() {
        resetButton.select("rect")
            .attr("fill", "#9baf9f");
        resetButton.select("text")
            .attr("font-weight", "700");
    })
    .on("click", resetZoom);

    resetButton.append("rect")
    .attr("width", 85)
    .attr("height", 25)
    .attr("fill", "#9baf9f")
    .attr("rx", 10)
    .attr("stroke", "#7a9a7f")
    .attr("stroke-width", 0) 
    .on("mouseover", function() {
        d3.select(this)
            .attr("stroke-width", 2);
    })
    .on("mouseout", function() {
        d3.select(this)
            .attr("stroke-width", 0);
    });

    resetButton.append("text")
    .attr("x", 42)
    .attr("y", 16)
    .attr("fill", "white")
    .attr("text-anchor", "middle")
    .style("font-size", "10px")
    .style("font-weight", "700")
    .style("pointer-events", "none")
    .text("Полный график");

    function resetZoom() {
        svg.transition()
            .duration(300)
            .call(zoom.transform, d3.zoomIdentity);
    }

    addTooltipWithZoom(svg, width, height);
}

//Adds a tooltip with zoom functionality to the chart
//@param {Object} svg - The d3 SVG element
//@param {number} width - The width of the chart
//@param {number} height - The height of the chart
function addTooltipWithZoom(svg, width, height) {
    d3.select("#main-chart .chart-tooltip").remove();
    d3.select("#main-chart svg .tooltip-line").remove();
    d3.select("#main-chart svg .mouse-tracker").remove();

    const margin = config.mainChart.margin;
    
    const tooltip = d3.select("#main-chart")
        .append("div")
        .attr("class", "chart-tooltip")
        .style("position", "absolute")
        .style("visibility", "hidden")
        .style("background", "#fff")
        .style("border", "1px solid #ddd")
        .style("border-radius", "4px")
        .style("padding", "8px 12px")
        .style("font-size", "12px")
        .style("box-shadow", "0 2px 4px rgba(0,0,0,0.1)")
        .style("pointer-events", "none")
        .style("z-index", "10");

    const tooltipLine = svg.append("line")
        .attr("class", "tooltip-line")
        .attr("stroke", "#666")
        .attr("stroke-width", 1)
        .attr("stroke-dasharray", "3,3")
        .style("opacity", 0);

    const chartArea = {
        x1: margin.left,
        x2: width - margin.right,
        y1: margin.top,
        y2: height - margin.bottom
    };

    const tracker = svg.append("rect")
        .attr("class", "mouse-tracker")
        .attr("x", chartArea.x1)
        .attr("y", chartArea.y1)
        .attr("width", chartArea.x2 - chartArea.x1)
        .attr("height", chartArea.y2 - chartArea.y1)
        .style("opacity", 0)
        .style("pointer-events", "all")
        .on("mouseover", function() {
            tooltip.style("visibility", "visible");
            tooltipLine.style("opacity", 1);
        })
        .on("mousemove", function(event) {
            if (window.isDragging) return;
            
            const [x, y] = d3.pointer(event, this);
            
            const date = xMainScale.invert(x);
            
            const bisect = d3.bisector(d => d.begin).left;
            const idx = bisect(filteredData, date, 1);
            const d = filteredData[idx - 1] || filteredData[idx];
            
            if (!d) return;
            
            d3.selectAll(".candle rect")
                .style("stroke", "none");
            
            d3.selectAll(".candle")
                .filter(candle => candle.begin.getTime() === d.begin.getTime())
                .select("rect")
                .style("stroke", "#000")
                .style("stroke-width", "1px");

            const xPos = xMainScale(d.begin);
            tooltipLine
                .attr("x1", xPos)
                .attr("x2", xPos)
                .attr("y1", 0)
                .attr("y2", height);

            tooltip.html(`
                <div><strong>${d3.timeFormat("%d %b %Y")(d.begin)}</strong></div>
                <div style="margin-top: 6px;">
                    <div>Открытие: <strong>${d.open.toFixed(2)}</strong></div>
                    <div>Закрытие: <strong>${d.close.toFixed(2)}</strong></div>
                    <div>Максимум: <strong>${d.high.toFixed(2)}</strong></div>
                    <div>Минимум: <strong>${d.low.toFixed(2)}</strong></div>
                    <div>Объем: <strong>${d.volume.toLocaleString()}</strong></div>
                </div>
            `)
            .style("left", (event.pageX + 10) + "px")
            .style("top", (event.pageY - 10) + "px");
        })
        .on("mouseout", function() {
            tooltip.style("visibility", "hidden");
            tooltipLine.style("opacity", 0);
            d3.selectAll(".candle rect")
                .style("stroke", "none");
        });
}

//Creates a volume chart
//@param {Object} svg - The d3 SVG element to draw the chart in
//@param {Array} data - The data to display
//@param {number} width - The width of the chart
//@param {number} height - The height of the chart
function createVolumeChart(svg, data, width, height) {
    svg.selectAll("*").remove();
    
    const volumeData = data.map(d => ({
        begin: d.begin,
        volumeValue: d.volume || d.value || 0,
        isIndex: !d.volume && d.value
    }));

    svg.append("defs").append("clipPath")
        .attr("id", "volume-clip")
        .append("rect")
        .attr("width", width - config.volumeChart.margin.left - config.volumeChart.margin.right)
        .attr("height", height - config.volumeChart.margin.top - config.volumeChart.margin.bottom)
        .attr("x", config.volumeChart.margin.left)
        .attr("y", config.volumeChart.margin.top);

    const chartGroup = svg.append("g")
        .attr("class", "volume-group")
        .attr("clip-path", "url(#volume-clip)");

    const xOriginal = xVolumeScale.copy();
    const yOriginal = yVolumeScale.copy();

    const bars = chartGroup.selectAll(".volume-bar")
        .data(volumeData)
        .enter()
        .append("rect")
        .attr("class", d => `volume-bar ${d.isIndex ? 'index-volume' : 'stock-volume'}`)
        .attr("x", d => xVolumeScale(d.begin) - config.mainChart.candleWidth/2)
        .attr("y", d => yVolumeScale(d.volumeValue))
        .attr("width", config.mainChart.candleWidth)
        .attr("height", d => height - config.volumeChart.margin.bottom - yVolumeScale(d.volumeValue))
        .attr("fill", d => d.isIndex ? "#6a5acd" : "#4285f4");

    const xAxis = svg.append("g")
        .attr("class", "x-axis")
        .attr("transform", `translate(0,${height - config.volumeChart.margin.bottom})`)
        .call(d3.axisBottom(xVolumeScale));

    const yAxis = svg.append("g")
        .attr("class", "y-axis")
        .attr("transform", `translate(${config.volumeChart.margin.left},0)`)
        .call(d3.axisLeft(yVolumeScale).ticks(7));

    svg.append("text")
        .attr("x", width / 2)
        .attr("y", config.volumeChart.margin.top - 10)
        .attr("class", "volume-title")
        .style("font-size", "14px")
        .text(volumeData.some(d => d.isIndex) ? "Стоимость торгов" : "Объем торгов");

    const zoom = d3.zoom()
        .scaleExtent([1, 20])
        .translateExtent([[0, 0], [width, height]])
        .on("zoom", zoomed);

    svg.call(zoom);

    function zoomed(event) {

        const newX = event.transform.rescaleX(xOriginal);
        xVolumeScale.domain(newX.domain());

        const visibleData = volumeData.filter(d => 
            d.begin >= xVolumeScale.domain()[0] && 
            d.begin <= xVolumeScale.domain()[1]
        );

        if (visibleData.length > 0) {
            const maxVolume = d3.max(visibleData, d => d.volumeValue);
            yVolumeScale.domain([0, maxVolume * 1.1]);
        }

        updateChart();
    }

    function updateChart() {
        const barWidth = Math.max(
            1,
            (xVolumeScale(xVolumeScale.domain()[1]) - xVolumeScale(xVolumeScale.domain()[0])) / 
            volumeData.length * 0.8
        );

        bars.attr("x", d => xVolumeScale(d.begin) - barWidth/2)
            .attr("width", barWidth)
            .attr("y", d => yVolumeScale(d.volumeValue))
            .attr("height", d => height - config.volumeChart.margin.bottom - yVolumeScale(d.volumeValue));

        xAxis.call(d3.axisBottom(xVolumeScale));
        yAxis.call(d3.axisLeft(yVolumeScale).ticks(5));
    }

    const resetButton = svg.append("g")
    .attr("class", "zoom-reset")
    .attr("transform", `translate(${width - 100},20)`)
    .style("cursor", "pointer")
    .on("mouseover", function() {
        resetButton.select("rect")
            .attr("fill", "#7a9a7f");
        resetButton.select("text")
            .attr("font-weight", "bold");
    })
    .on("mouseout", function() {
        resetButton.select("rect")
            .attr("fill", "#9baf9f");
        resetButton.select("text")
            .attr("font-weight", "700");
    })
    .on("click", resetZoom);

    resetButton.append("rect")
    .attr("width", 85)
    .attr("height", 25)
    .attr("fill", "#9baf9f")
    .attr("rx", 10)
    .attr("stroke", "#7a9a7f")
    .attr("stroke-width", 0)
    .on("mouseover", function() {
        d3.select(this)
            .attr("stroke-width", 2);
    })
    .on("mouseout", function() {
        d3.select(this)
            .attr("stroke-width", 0);
    });

    resetButton.append("text")
    .attr("x", 42)
    .attr("y", 16)
    .attr("fill", "white")
    .attr("text-anchor", "middle")
    .style("font-size", "10px")
    .style("font-weight", "700")
    .style("pointer-events", "none")
    .text("Полный график");

    function resetZoom() {
        svg.transition()
            .duration(300)
            .call(zoom.transform, d3.zoomIdentity);
    }
}

//Adds company/info information to the UI
//@param {string} type - The type of security ('stocks' or 'indexes')
//@param {string} tickerName - The ticker symbol
function addInfo(type, tickerName) {
    const typeName = type === "stocks" ? "Акция" : "Индекс";
    const containerId = type === "stocks" ? "#company_info_stocks" : "#company_info_other";
    const container = d3.select(containerId);
    container.selectAll("*").remove();
    
    const infoBox = container.append("div")
        .attr("class", "company-info-box");

    const company = tickerInfo.filter(d => d.ticker === tickerName);
    if (company) {
        infoBox.append("h3")
            .text(`${company[0].name} (${company[0].ticker})`);
        
        infoBox.append("div")
            .attr("class", "info-row")
            .html(`<span class="label">Сектор:</span> ${company[0].sector}`);

        infoBox.append("div")
            .attr("class", "info-row")
            .html(`<span class="label">Тип:</span> ${typeName}\n`);
        
        infoBox.append("div")
            .attr("class", "info-description")
            .text(company[0].description);

    } else {
        infoBox.append("div")
            .attr("class", "no-data")
            .text(`Нет информации по ${tickerName}`);
    }

}

//Creates a dividend chart
//@param {Array} data - The dividend data to display
function createDividend(data) {
    if (data.length > 0) {
        const container = d3.select("#additional_content");
        container.selectAll("*").remove();

        const tooltip = d3.select("body").append("div")
            .attr("class", "tooltip")
            .style("opacity", 0)
            .style("position", "absolute")
            .style("background", "white")
            .style("border", "1px solid #ddd")
            .style("padding", "8px")
            .style("border-radius", "4px")
            .style("pointer-events", "none");

        const containerWidth = container.node().getBoundingClientRect().width;
        const width = containerWidth - 40;
        const height = 400;
        const margin = {top: 40, right: 30, bottom: 100, left: 60};
        const innerWidth = width - margin.left - margin.right;
        const innerHeight = height - margin.top - margin.bottom;
        const timeFormat = d3.timeFormat("%b %Y");

        const svg = container.append("svg")
            .attr("width", width)
            .attr("height", height)
            .append("g")
            .attr("transform", `translate(${margin.left},${margin.top})`);

        const processedData = data.map(d => ({
            name: timeFormat(new Date(d.registryclosedate)),
            value: parseFloat(d.value),
            currency: d.currencyid
        }));

        const x = d3.scaleBand()
            .domain(processedData.map(d => d.name))
            .range([0, innerWidth])
            .padding(0.3);

        const y = d3.scaleLinear()
            .domain([0, d3.max(processedData, d => d.value) * 1.1])
            .nice()
            .range([innerHeight, 0]);

        const colorPalette = [
            "#e18d6e",
            "#d08cb5",
            "#9b7ab2",
            "#8584bd",
            "#87adda",
            "#7cbbc6",
            "#86bf9e",
            "#beda97",
            "#f8f19f",
            "#f0c486"
        ];

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
    
        svg.append("text")
            .attr("x", innerWidth / 2 - 25)
            .attr("y", -13)
            .attr("text-anchor", "middle")
            .style("font-size", "16px")
            .style("font-weight", "bold")
            .text(`Дивиденды ${data[0].DIV_TICK} (${data[0].currencyid})`);

        svg.append("text")
            .attr("x", innerWidth / 2 - 30)
            .attr("y", innerHeight + margin.bottom - 40)
            .attr("text-anchor", "middle")
            .style("font-size", "12px")
            .text("Год");
            
        addInfo("stocks", data[0].DIV_TICK)

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

//Updates the structure charts for a given index
//@param {string} chosenVal - The index ticker symbol
function updateStructureCharts(chosenVal) {
    const selectedIndex = chosenVal.toUpperCase();
    const tickerData = processTickerData(selectedIndex);
    const sectorData = processSectorData(selectedIndex);
    
    const indexName = moexData.composition[selectedIndex]?.name || 
                     moexData.sectors[selectedIndex]?.name || 
                     selectedIndex;
                     
    if (tickerData.length > 0) {
        createPieChart(tickerData, "pie-chart", `${indexName} (состав портфеля)`, selectedIndex);
    } else {
        d3.select("#pie-chart").html("<p>No ticker data available</p>");
    }
    
    if (sectorData.length > 0) {
        createBarChart(sectorData, "bar-chart", `${indexName} (отраслевая структура)`, selectedIndex);
    } else {
        d3.select("#bar-chart").html("<p>No sector data available</p>");
    }
}

//Processes ticker composition data for an index
//@param {string} index - The index ticker symbol
//@returns {Array} Processed ticker data
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

//Processes sector composition data for an index
//@param {string} index - The index ticker symbol
//@returns {Array} Processed sector data
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

//Creates a pie chart showing index composition
//@param {Array} data - The data to display
//@param {string} containerId - The ID of the container element
//@param {string} title - The chart title
//@param {string} indexName - The index name
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
        "#e18d6e",
        "#d08cb5",
        "#9b7ab2",
        "#8584bd",
        "#87adda",
        "#7cbbc6",
        "#86bf9e",
        "#beda97",
        "#f8f19f",
        "#f0c486"
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

//Creates a bar chart showing sector composition
//@param {Array} data - The data to display
//@param {string} containerId - The ID of the container element
//@param {string} title - The chart title
//@param {string} indexName - The index name
function createBarChart(data, containerId, title, indexName) {

    const container = d3.select(`#${containerId}`);
    container.selectAll("*").remove();

    const containerWidth = container.node().getBoundingClientRect().width;
    const width = containerWidth;
    const height = 400;
    const margin = {top: 40, right: 30, bottom: 100, left: 60};
    const innerWidth = width - margin.left - margin.right;
    const innerHeight = height - margin.top - margin.bottom;

    addInfo("indexes", indexName)

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
        "#e18d6e",
        "#d08cb5",
        "#9b7ab2",
        "#8584bd",
        "#87adda",
        "#7cbbc6",
        "#86bf9e",
        "#beda97",
        "#f8f19f",
        "#f0c486"
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
            .tickSize(-innerWidth)
            .tickFormat(d => `${d} %`)
        )
        .call(g => g.select(".domain").remove())
        .call(g => g.selectAll(".tick line")
            .attr("stroke-opacity", 0.1)
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
        .attr("transform", "rotate(-25)")
        .attr("text-anchor", "end")
        .attr("dx", "-.8em")
        .attr("dy", ".15em")
        .style("font-size", "10px");

    svg.append("text")
        .attr("x", 600)
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
    .attr("transform", (d, i) => `translate(${innerWidth - 300},${20 + i * 20})`);

    legend.append("rect")
    .attr("width", 16)
    .attr("height", 16)
    .attr("x", -20)
    .attr("y", -30)
    .attr("fill", (d, i) => colorPalette[i % colorPalette.length])

    legend.append("text")
    .attr("x", 5)
    .attr("y", -17.5)
    .text(d => `${d.name} (${d.value.toFixed(1)}%)`)
    .style("font-size", "12px");
}

const tooltip = d3.select("body").append("div")
    .attr("class", "tooltip")
    .style("opacity", 0);

//Updates the main chart with filtered data
//@param {Array} filteredData - The filtered data to display
function updateMainChart(filteredData) {
    this.filteredData = filteredData;

    xMainScale.domain(d3.extent(filteredData, d => d.begin));
    xVolumeScale.domain(xMainScale.domain());
    
    yMainScale.domain([d3.min(filteredData, d => d.low) * 0.99, 
                      d3.max(filteredData, d => d.high) * 1.01]);
    
    yVolumeScale.domain([0, d3.max(filteredData, d => d.volume)]);

    const mainSvg = d3.select("#main-chart svg");
    const volumeSvg = d3.select("#volume-chart svg");
    const width = document.getElementById('chart-container').clientWidth - 20;
    
    const xAxis = d3.axisBottom(xMainScale)
        .tickFormat(d3.timeFormat("%b %Y"))
        .tickValues(adjustXTicks(xMainScale, width - config.mainChart.margin.left - config.mainChart.margin.right));
    
    mainSvg.select(".x-axis")
        .call(xAxis);

    mainSvg.select(".y-axis")
        .call(d3.axisLeft(yMainScale));

    volumeSvg.select(".x-axis")
        .call(d3.axisBottom(xVolumeScale));

    volumeSvg.select(".y-axis")
        .call(d3.axisLeft(yVolumeScale).ticks(7));

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

    const volumes = volumeSvg.selectAll(".volume-bar")
        .data(filteredData);

    volumes.exit().remove();

    volumes.attr("x", d => xVolumeScale(d.begin) - config.mainChart.candleWidth/2)
        .attr("y", d => yVolumeScale(d.volume))
        .attr("height", d => volumeSvg.attr("height") - config.volumeChart.margin.bottom - yVolumeScale(d.volume));

    volumes.enter()
        .append("rect")
        .attr("class", "volume-bar")
        .attr("x", d => xVolumeScale(d.begin) - config.mainChart.candleWidth/2)
        .attr("y", d => yVolumeScale(d.volume))
        .attr("width", config.mainChart.candleWidth)
        .attr("height", d => volumeSvg.attr("height") - config.volumeChart.margin.bottom - yVolumeScale(d.volume))
        .attr("fill", "#4285f4");
    addTooltip()
}

//Sets up period filter buttons
function setupPeriodButtons() {
    d3.selectAll(".period-btn").on("click", function() {
        d3.selectAll(".period-btn").classed("active", false);
        d3.select(this).classed("active", true);
        filterDataByPeriod(this.dataset.period);
    });
}

//Filters the data by the selected period
//@param {string} period - The period to filter by ('month', 'year', 'all')
function filterDataByPeriod(period) {
    let filtered = [...allData];
    if (filtered.length !== 0){
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
}
    if (filtered.length === 0){
        
        filteredData = [...filterIndex]
        filteredData = prepareData(filteredData)
        Data_i = prepareData(allDataIndex)
        lastDate = new Date(Data_i[Data_i.length - 1].begin);
        filtered = [...Data_i]
        if (period === "month") {
            const monthAgo = new Date(lastDate);
            monthAgo.setMonth(monthAgo.getMonth() - 1);
            filtered = Data_i.filter(d => d.begin >= monthAgo);
        } 
        else if (period === "year") {
            const yearAgo = new Date(lastDate);
            yearAgo.setFullYear(yearAgo.getFullYear() - 1);
            filtered = Data_i.filter(d => d.begin >= yearAgo);
        }
    }
    addTooltip();
    updateChartsWithData(filtered);
}

//Updates charts with filtered data
//@param {Array} data - The filtered data to display
function updateChartsWithData(data) {
    if (!data || data.length === 0) return;
    
    filteredData = prepareData(data);
    
    const container = document.getElementById('chart-container');
    if (!container) return;
    
    const width = container.clientWidth - 70;
    const mainHeight = config.mainChart.height;
    const volumeHeight = config.volumeChart.height;
    
    setupScales(filteredData, width, mainHeight, volumeHeight);
    
    d3.select("#main-chart svg").remove();
    d3.select("#volume-chart svg").remove();
    
    const mainSvg = d3.select("#main-chart")
        .append("svg")
        .attr("width", width)
        .attr("height", mainHeight);
        
    const volumeSvg = d3.select("#volume-chart")
        .append("svg")
        .attr("width", width)
        .attr("height", volumeHeight);
    
    createCandlestickChart(mainSvg, filteredData, width, mainHeight, currentTicker);
    createVolumeChart(volumeSvg, filteredData, width, volumeHeight);
    addTooltip();
    if (brush) {
        d3.select("#volume-chart svg .brush").call(brush.move, null);
    }
    addTooltip();
}

document.addEventListener('DOMContentLoaded', initApp);

//Creates an open price chart for the given ticker
//@param {string} tickerName - The ticker symbol to display
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

    const width = container.node().getBoundingClientRect().width/1.22
    const height = 360;
    const margin = {top: 25, bottom: 0, left: 80};
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
        .attr("stroke", "#9baf9f")
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
        .attr("transform", `translate(0,${innerHeight})`)

    const yAxis = svg.append("g")
        .attr("class", "y-axis");

    const title = svg.append("text")
        .attr("x", innerWidth / 2)
        .attr("y", -10)
        .attr("text-anchor", "middle")
        .style("font-size", "16px")
        .style("font-weight", "bold");

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
            .attr("d", line)

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
            .call(tickValues ? xAxisFormatter.tickValues(tickValues) : xAxisFormatter)
            .selectAll("text")
            .style("text-anchor", "end")
            .attr("dx", "-.8em")
            .attr("dy", ".15em")
            .attr("transform", "rotate(-35)"); 
        
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
        const x0 = x.invert(d3.pointer(event, this)[0]);
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
        
        const xPos = x(d.begin);
        const yPos = y(d[currentPriceType]);
        focus.attr("transform", `translate(${xPos},${yPos})`);
        
        const tooltipText = focus.select("text.tooltip-text")
            .html("")
            .attr("transform", "translate(0,20)");
        
        tooltipText.append("tspan")
            .attr("x", 10)
            .attr("dy", "0")
            .text(`${priceLabels[currentPriceType]} ${formattedDate}:`);
        
        tooltipText.append("tspan")
            .attr("x", 10)
            .attr("dy", "1.2em")
            .text(`${d[currentPriceType].toFixed(2)} руб.`);
        
        const textBBox = tooltipText.node().getBBox();
        let tooltipX = 10;
        let textAnchor = "start";
        
        if (xPos > innerWidth - textBBox.width - 20) {
            tooltipX = -10;
            textAnchor = "end";
        }
        
        tooltipText.attr("transform", `translate(${tooltipX},20)`)
                  .attr("text-anchor", textAnchor);
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

//Sets up filter controls for the open price chart
//@param {string} tickerName - The ticker symbol
function setupFilterControls(tickerName) {
    const chartContainer = document.getElementById('open-price-chart-container');
    
    const filterContainer = document.createElement("div");
    const isInd = tickerSets.indices.includes(tickerName);
    const initialFilter = isInd ? "indices" : "stocks";
    filterContainer.className = "filter-container";
    filterContainer.style.margin = "10px 20px";
    filterContainer.style.display = "flex";
    filterContainer.style.alignItems = "center";
    filterContainer.style.gap = "10px";

    filterContainer.innerHTML = `
        <span>Показать популярные:</span>
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

//Handles filter changes for the open price chart
//@param {string} type - The filter type ('stocks' or 'indices')
function handleOpenPriceChartFilter(type) {
    d3.selectAll('#open-price-chart-container .filter-btn')
        .classed("active", function() {
            return this.id === `${type}-filter`;
        });
    
    updateOpenPriceChartTickerButtons(type);
    
    document.querySelector('#open-price-chart-container .filter-container')
        .dataset.currentFilter = type;
}

//Updates ticker buttons for the open price chart based on filter
//@param {string} type - The filter type ('stocks' or 'indices')
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

//Shows price information when hovering over a ticker button
//@param {HTMLElement} buttonElement - The button element
//@param {string} ticker - The ticker symbol
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

//Updates ticker buttons based on type
//@param {string} type - The type of tickers ('stocks' or 'indices')
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
                addTooltip();
                createDividend(filter_dividends);
                createOpenPriceChart(ticker);
            });
        });
        buttonsContainer.appendChild(btn);
    });
}

//Shows a toast notification
//@param {string} message - The message to display
function showToast(message) {
    const toast = document.getElementById("toast");
    toast.textContent = message;
    toast.classList.add("show");
  
    setTimeout(() => {
      toast.classList.remove("show");
    }, 2000);
  }

//Shows the relevant view based on search input
//@param {string} searchInput - The search input type ('stocks' or 'indexes')
function showRelevantView(searchInput) {

    const stockView = document.getElementById('stock-column');
    const indexView = document.getElementById('index-column');
    const barChart = document.getElementById('bar-chart');
    const container = document.getElementById('stock-view');
  
    stockView.classList.remove('active');
    indexView.classList.remove('active');
    container.classList.remove('index-view-active');

    let isStock, isIndex;
    if (searchInput == "stocks") {
        isStock = true;
    } else if (searchInput == "indexes") {
        isIndex = true;
    }

    if (isStock) {
        stockView.classList.add('active');
    } else if (isIndex) {
        indexView.classList.add('active');
        container.classList.add('index-view-active');
    }

    document.getElementById('open-price-chart-container').style.display = 'flex';
}