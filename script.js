
const config = {
    defaultTicker: 'SBER',
    dataUrl: 'Data.json',
    dataDividend:'div.json',
    mainChart: {
        height: 400,
        margin: { top: 40, right: 40, bottom: 30, left: 60 },
        candleWidth: 2
    },
    volumeChart: {
        height: 150,
        margin: { top: 30, right: 40, bottom: 40, left: 80 }
    }
};

let allData = [];
let filteredData = [];
let xMainScale, yMainScale, xVolumeScale, yVolumeScale;
let brush;
let currentTicker = config.defaultTicker;
let tickerMap = {};

async function initApp() {
    setupUI();
    await loadData(currentTicker);
    createCombinedCharts(filteredData, currentTicker);
    createDividend(filter_dividends)
    setupPeriodButtons();
}

async function loadData(ticker) {
        const originalData = await fetchData();
        allData = originalData.filter(item => item.STOCK_TICK === ticker && item.period === 'D')
                            .map(item => ({
                                ...item,
                                begin: new Date(item.begin),
                                type: item.close >= item.open ? 'bullish' : 'bearish'
                            }));
        filteredData = [...allData];
        const divData = await fetchDividendData();
        dividends = divData.filter(item => item.DIV_TICK === ticker);
        filter_dividends = [...dividends];
        currentTicker = ticker;
        fetchDictionary();
}

async function fetchDividendData(){
    const response = await fetch(config.dataDividend);
    if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
    }
    return await response.json();
}

async function fetchData() {
    const response = await fetch(config.dataUrl);
    if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
    }
    return await response.json();
}

async function fetchDictionary(){
    fetch('tickerDictionary.json')
.then(response => response.json())
.then(data => {
  tickerMap = data;
  initAutocomplete();
})
.catch(error => console.error("Ошибка загрузки словаря:", error));
}



function setupUI() {
    const headerSearch = document.getElementById('headerSearch');
    const searchInput = document.createElement("input");
    searchInput.type = "text";
    searchInput.placeholder = "Тикер (SBER, GAZP...) или название";
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
                .attr("fill", d.type === 'bullish' ? '#4CAF50' : '#F44336');
            
            g.append("line")
                .attr("x1", 0)
                .attr("x2", 0)
                .attr("y1", yMainScale(d.high))
                .attr("y2", yMainScale(d.low))
                .attr("stroke", d.type === 'bullish' ? '#4CAF50' : '#F44336')
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
        .attr("y", config.mainChart.margin.top / 2)
        .attr("text-anchor", "middle")
        .style("font-size", "18px")
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
        .call(d3.axisLeft(yVolumeScale));

    svg.append("text")
        .attr("x", width / 2)
        .attr("y", config.volumeChart.margin.top)
        .attr("class", "volume-title")
        .style("font-size", "14px")
        .text("Объем торгов");
}

function createDividend(data) {
    if (data.length > 0){
    const container = d3.select("#additional_content");
    container.selectAll("*").remove(); 
    
    const containerWidth = container.node().getBoundingClientRect().width/4;
    const width = containerWidth;
    const height = 300;
    
    const svg = container.append("svg")
        .attr("width", width)
        .attr("height", height)
        .attr("viewBox", `0 0 ${width} ${height}`);
    
    const margin = {top: 30, right: 20, bottom: 50, left: 50};
    const innerWidth = width - margin.left - margin.right;
    const innerHeight = height - margin.top - margin.bottom;
    
    const processedData = data.map(d => ({
        year: new Date(d.registryclosedate).getFullYear(),
        value: parseFloat(d.value),
        currency: d.currencyid,
        date: d.registryclosedate
    }));
    
    const groupedData = d3.rollup(
        processedData,
        v => d3.sum(v, d => d.value),
        d => d.year
    );
    
    const yearData = Array.from(groupedData, ([year, value]) => ({year, value}))
                       .sort((a, b) => a.year - b.year);
    
    const x = d3.scaleBand()
        .domain(yearData.map(d => d.year.toString()))
        .range([0, innerWidth])
        .padding(0.2);
    
    const y = d3.scaleLinear()
        .domain([0, d3.max(yearData, d => d.value) * 1.1])
        .range([innerHeight, 0]);
    

    const g = svg.append("g")
        .attr("transform", `translate(${margin.left},${margin.top})`);
    
    g.selectAll(".bar")
        .data(yearData)
        .enter()
        .append("rect")
        .attr("class", "bar")
        .attr("x", d => x(d.year.toString()))
        .attr("y", d => y(d.value))
        .attr("width", x.bandwidth())
        .attr("height", d => innerHeight - y(d.value))
        .attr("fill", "#4285f4");
    
    g.selectAll(".bar-label")
        .data(yearData)
        .enter()
        .append("text")
        .attr("class", "bar-label")
        .attr("x", d => x(d.year.toString()) + x.bandwidth() / 2)
        .attr("y", d => y(d.value) - 5)
        .attr("text-anchor", "middle")
        .style("font-size", "10px")
        .text(d => d.value.toFixed(1));
    
    g.append("g")
        .attr("class", "axis axis-x")
        .attr("transform", `translate(0,${innerHeight})`)
        .call(d3.axisBottom(x));
    
    g.append("g")
        .attr("class", "axis axis-y")
        .call(d3.axisLeft(y).ticks(5));
    
    svg.append("text")
        .attr("x", width / 2)
        .attr("y", 20)
        .attr("text-anchor", "middle")
        .style("font-size", "14px")
        .style("font-weight", "bold")
        .text(`Дивиденды ${data[0].DIV_TICK} по годам (${data[0].currencyid})`);
    
    svg.append("text")
        .attr("x", width / 2)
        .attr("y", height - 10)
        .attr("text-anchor", "middle")
        .style("font-size", "12px")
        .text("Год");
    
    svg.append("text")
        .attr("transform", "rotate(-90)")
        .attr("x", -height / 2)
        .attr("y", 15)
        .attr("text-anchor", "middle")
        .style("font-size", "12px")
        .text("Сумма");
    }else {
        const container = document.getElementById('additional_content');
        

        if (container) {
            container.innerHTML = "";
            container.textContent = "Нет данных о дивидендах для этой компании";
            container.style.textAlign = "center";
            container.style.fontSize = "20px";
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
                .attr("fill", d.type === 'bullish' ? '#4CAF50' : '#F44336');
            
            g.append("line")
                .attr("x1", 0)
                .attr("x2", 0)
                .attr("y1", yMainScale(d.high))
                .attr("y2", yMainScale(d.low))
                .attr("stroke", d.type === 'bullish' ? '#4CAF50' : '#F44336')
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