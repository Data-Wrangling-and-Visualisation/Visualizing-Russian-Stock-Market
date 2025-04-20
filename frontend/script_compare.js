//general constants
const width = 1300,
  height = 500,
  margin = { top: 20, right: 30, bottom: 50, left: 50 };
const innerWidth = width - margin.left - margin.right;
const innerHeight = height - margin.top - margin.bottom;

//creating an SVG container
const svg = d3
  .select("#chart")
  .append("svg")
  .attr("width", width)
  .attr("height", height)
  .append("g")
  .attr("transform", `translate(${margin.left},${margin.top})`);

const g = svg.append("g");
const tooltip = d3
  .select("body")
  .append("div")
  .attr("class", "tooltip")
  .style("opacity", 0);

//Initializing scales for the X and Y axes
let x = d3.scaleTime().range([0, innerWidth]);
let y = d3.scaleLinear().range([innerHeight, 0]);

const xAxis = g
  .append("g")
  .attr("class", "axis axis--x")
  .attr("transform", `translate(0,${innerHeight})`);
const yAxis = g.append("g").attr("class", "axis axis--y");

let indexData = {};
let stockData = {};

let indexNamesMap = {};
let stockNamesMap = {};

//Downloading data from the server and preparing it
Promise.all([
  fetch("http://localhost:5500/api/data/index").then((response) =>
    response.json()
  ),
  fetch("http://localhost:5500/api/data/stock").then((response) =>
    response.json()
  ),
  fetch("http://localhost:5500/api/data/indexIndustryStructure").then(
    (response) => response.json()
  ),
  fetch("http://localhost:5500/api/data/dictionary").then((response) =>
    response.json()
  ),
])
  .then(
    ([
      indexDataResponse,
      stockDataResponse,
      industryStructure,
      tickerDictionary,
    ]) => {
      indexNamesMap = Object.fromEntries(
        Object.entries(industryStructure).map(([ticker, data]) => [
          ticker,
          data.name,
        ])
      );
      stockNamesMap = Object.fromEntries(
        Object.entries(tickerDictionary).map(([name, ticker]) => [ticker, name])
      );

      //Converting index and stock data into a convenient format
      indexData = indexDataResponse.reduce((acc, d) => {
        const index = d.INDEX_TICK;
        if (!acc[index]) acc[index] = [];
        acc[index].push({ date: d.begin.split(" ")[0], value: +d.close });
        return acc;
      }, {});

      //Similar for these stocks
      stockData = stockDataResponse.reduce((acc, d) => {
        const stock = d.STOCK_TICK;
        if (!acc[stock]) acc[stock] = [];
        acc[stock].push({ date: d.begin.split(" ")[0], value: +d.close });
        return acc;
      }, {});

      populateSelectors(Object.keys(indexData), Object.keys(stockData));
      updateChart();
    }
  )
  .catch((err) => console.error(err));

//function for geting displaying names of index and stock
function getDisplayName(ticker, isStock = false) {
  if (isStock) {
    return stockNamesMap[ticker] || ticker;
  }
  return indexNamesMap[ticker] || ticker;
}

//Function for filling drop-down lists
function populateSelectors(indexNames, stockNames) {
  const index1 = document.getElementById("index1");
  const index2 = document.getElementById("index2");
  const stock1 = document.getElementById("stock1");
  const stock2 = document.getElementById("stock2");
  const mixed1 = document.getElementById("mixed1");
  const mixed2 = document.getElementById("mixed2");

  [index1, index2, mixed1].forEach((select) => {
    select.innerHTML = "";
    indexNames.forEach((name) => {
      const option = new Option(getDisplayName(name), name);
      select.add(option);
    });
  });

  [stock1, stock2, mixed2].forEach((select) => {
    select.innerHTML = "";
    stockNames.forEach((name) => {
      const option = new Option(getDisplayName(name, true), name);
      select.add(option);
    });
  });

  if (indexNames.length >= 1) {
    index1.selectedIndex = 0;
    mixed1.selectedIndex = 0;
  }
  if (indexNames.length >= 2) {
    index2.selectedIndex = 1;
  }
  if (stockNames.length >= 1) {
    stock1.selectedIndex = 0;
    mixed2.selectedIndex = 0;
  }
  if (stockNames.length >= 2) {
    stock2.selectedIndex = 1;
  }
}
//function for a warning to appear from above
function showToast(message) {
  const toast = document.getElementById("toast");
  toast.textContent = message;
  toast.classList.add("show");

  setTimeout(() => {
    toast.classList.remove("show");
  }, 2000);
}
//The main function of updating the graph
function updateChart() {
  const comparisonMode = document.querySelector(
    ".comparison-mode button.active"
  ).id;

  //receive data for comparison depending on the mode
  let data1, data2, label1, label2, firstType, secondType;

  if (comparisonMode === "compareIndices") {
    const index1 = document.getElementById("index1").value;
    const index2 = document.getElementById("index2").value;
    data1 = indexData[index1];
    data2 = indexData[index2];
    label1 = index1;
    label2 = index2;
    firstType = "index";
    secondType = "index";
  } else if (comparisonMode === "compareStocks") {
    const stock1 = document.getElementById("stock1").value;
    const stock2 = document.getElementById("stock2").value;
    data1 = stockData[stock1];
    data2 = stockData[stock2];
    label1 = stock1;
    label2 = stock2;
    firstType = "stock";
    secondType = "stock";
  } else {
    firstType = document.querySelector("label[for='mixed1']").dataset.type;
    secondType = document.querySelector("label[for='mixed2']").dataset.type;

    const mixed1 = document.getElementById("mixed1").value;
    const mixed2 = document.getElementById("mixed2").value;

    data1 = firstType === "index" ? indexData[mixed1] : stockData[mixed1];
    data2 = secondType === "index" ? indexData[mixed2] : stockData[mixed2];
    label1 = mixed1;
    label2 = mixed2;
  }

  //checking that the data has been uploaded
  if (!data1 || !data2) {
    alert("Не удалось загрузить данные для сравнения");
    return;
  }
  //checking that the data for comparision is different
  if (label1 === label2 && firstType === secondType) {
    showToast("Выберите разные данные для сравнения");
    return;
  }

  //Data processing: removing duplicates, sorting by date
  const unique = (arr) =>
    Array.from(
      new Map(arr.map((item) => [item.date.toISOString(), item])).values()
    );

  const processedData1 = unique(
    data1.map((d) => ({
      date: new Date(d.date),
      value: d.value,
    }))
  ).sort((a, b) => a.date - b.date);

  const processedData2 = unique(
    data2.map((d) => ({
      date: new Date(d.date),
      value: d.value,
    }))
  ).sort((a, b) => a.date - b.date);

  const base1 = processedData1[0]?.value;
  const base2 = processedData2[0]?.value;

  if (!base1 || !base2) {
    alert("Недостаточно данных для построения графика");
    return;
  }

  //conversion to a percentage change from the initial value
  const normalized1 = processedData1.map((d) => ({
    date: d.date,
    value: (d.value / base1 - 1) * 100,
    label: label1,
    originalValue: d.value,
  }));

  const normalized2 = processedData2.map((d) => ({
    date: d.date,
    value: (d.value / base2 - 1) * 100,
    label: label2,
    originalValue: d.value,
  }));

  const combinedData = [...normalized1, ...normalized2];

  x.domain(d3.extent(combinedData, (d) => d.date));
  y.domain([
    Math.min(
      d3.min(normalized1, (d) => d.value),
      d3.min(normalized2, (d) => d.value)
    ) * 1.05,
    Math.max(
      d3.max(normalized1, (d) => d.value),
      d3.max(normalized2, (d) => d.value)
    ) * 1.05,
  ]);

  xAxis.call(d3.axisBottom(x));
  yAxis.call(d3.axisLeft(y).tickFormat((d) => d.toFixed(1) + "%"));

  svg.selectAll(".line").remove();
  svg.selectAll(".legend").remove();
  svg.selectAll(".dot").remove();

  //drawing lines on a graph
  const line = d3
    .line()
    .defined((d) => d.value != null)
    .x((d) => x(d.date))
    .y((d) => y(d.value));

  const path1 = svg
    .append("path")
    .datum(normalized1)
    .attr("class", "line line1")
    .attr("stroke", "#86bf9e")
    .attr("stroke-opacity", 0.8)
    .attr("fill", "none")
    .attr("stroke-width", 2)
    .attr("d", line);

  const path2 = svg
    .append("path")
    .datum(normalized2)
    .attr("class", "line line2")
    .attr("stroke", "#8584bd")
    .attr("stroke-opacity", 0.8)
    .attr("fill", "none")
    .attr("stroke-width", 2)
    .attr("d", line);

  const legend = svg
    .append("g")
    .attr("class", "legend")
    .attr("transform", `translate(${innerWidth - 150}, 20)`);

  //function for long name for display on graph
  function shortenName(name, maxLength = 15) {
    return name.length > maxLength
      ? name.substring(0, maxLength) + "..."
      : name;
  }
  //adding legends
  legend
    .append("rect")
    .attr("x", 0)
    .attr("y", 0)
    .attr("width", 10)
    .attr("height", 10)
    .attr("fill", "#86bf9e");

  const isFirstStock =
    comparisonMode === "compareStocks" ||
    (comparisonMode === "compareMixed" &&
      document.querySelector("label[for='mixed1']").dataset.type === "stock");

  legend
    .append("text")
    .attr("x", 15)
    .attr("y", 10)
    .text(shortenName(getDisplayName(label1, isFirstStock)));

  legend
    .append("rect")
    .attr("x", 0)
    .attr("y", 20)
    .attr("width", 10)
    .attr("height", 10)
    .attr("fill", "#8584bd");

  const isSecondStock =
    comparisonMode === "compareStocks" ||
    (comparisonMode === "compareMixed" &&
      document.querySelector("label[for='mixed2']").dataset.type === "stock");

  legend
    .append("text")
    .attr("x", 15)
    .attr("y", 30)
    .text(shortenName(getDisplayName(label2, isSecondStock)));

  //adding points for interactivity
  const dots1 = svg
    .append("g")
    .attr("class", "dots1")
    .selectAll(".dot")
    .data(normalized1)
    .enter()
    .append("circle")
    .attr("class", "dot")
    .attr("cx", (d) => x(d.date))
    .attr("cy", (d) => y(d.value))
    .attr("r", 5)
    .style("opacity", 0)
    .style("pointer-events", "all");

  const dots2 = svg
    .append("g")
    .attr("class", "dots2")
    .selectAll(".dot")
    .data(normalized2)
    .enter()
    .append("circle")
    .attr("class", "dot")
    .attr("cx", (d) => x(d.date))
    .attr("cy", (d) => y(d.value))
    .attr("r", 5)
    .style("opacity", 0)
    .style("pointer-events", "all");

  //Event handlers for tooltips and hover effects
  const showTooltip = (event, d) => {
    const isStockTooltip = d.label === label2 ? isSecondStock : isFirstStock;

    tooltip
      .html(
        `
    <div><strong>${getDisplayName(d.label, isStockTooltip)}</strong></div>
    <div>Дата: ${d.date.toLocaleDateString()}</div>
    <div>Изменение: ${d.value.toFixed(2)}%</div>
    <div>Цена: ${d.originalValue.toFixed(2)}</div>
  `
      )
      .style("left", event.pageX + 15 + "px")
      .style("top", event.pageY - 30 + "px")
      .style("opacity", 1);
  };

  const handleMouseOver = function (event, d) {
    showTooltip(event, d);
    if (d.label === label1) {
      path1.attr("stroke-opacity", 1);
      path2.attr("stroke-opacity", 0.1);
    } else {
      path2.attr("stroke-opacity", 1);
      path1.attr("stroke-opacity", 0.1);
    }
  };

  const handleMouseOut = function () {
    tooltip.style("opacity", 0);
    path1.attr("stroke-opacity", 0.8);
    path2.attr("stroke-opacity", 0.8);
  };

  dots1.on("mouseover", handleMouseOver).on("mouseout", handleMouseOut);
  dots2.on("mouseover", handleMouseOver).on("mouseout", handleMouseOut);

  path1
    .on("mouseover", function () {
      path1.attr("stroke-opacity", 1);
      path2.attr("stroke-opacity", 0.1);
    })
    .on("mouseout", function () {
      path1.attr("stroke-opacity", 0.8);
      path2.attr("stroke-opacity", 0.8);
    });

  path2
    .on("mouseover", function () {
      path2.attr("stroke-opacity", 1);
      path1.attr("stroke-opacity", 0.1);
    })
    .on("mouseout", function () {
      path1.attr("stroke-opacity", 0.8);
      path2.attr("stroke-opacity", 0.8);
    });
}

document.getElementById("compareIndices").classList.add("active");
document.getElementById("indicesComparison").style.display = "block";
document.getElementById("stocksComparison").style.display = "none";
document.getElementById("mixedComparison").style.display = "none";

//Event handlers for switching comparison modes
document
  .getElementById("compareIndices")
  .addEventListener("click", function () {
    document
      .querySelectorAll(".comparison-mode button")
      .forEach((btn) => btn.classList.remove("active"));
    this.classList.add("active");
    document.getElementById("indicesComparison").style.display = "block";
    document.getElementById("stocksComparison").style.display = "none";
    document.getElementById("mixedComparison").style.display = "none";
    updateChart();
  });

document.getElementById("compareStocks").addEventListener("click", function () {
  document
    .querySelectorAll(".comparison-mode button")
    .forEach((btn) => btn.classList.remove("active"));
  this.classList.add("active");
  document.getElementById("indicesComparison").style.display = "none";
  document.getElementById("stocksComparison").style.display = "block";
  document.getElementById("mixedComparison").style.display = "none";
  updateChart();
});

document.getElementById("compareMixed").addEventListener("click", function () {
  document
    .querySelectorAll(".comparison-mode button")
    .forEach((btn) => btn.classList.remove("active"));
  this.classList.add("active");
  document.getElementById("indicesComparison").style.display = "none";
  document.getElementById("stocksComparison").style.display = "none";
  document.getElementById("mixedComparison").style.display = "block";
  updateChart();
});

document
  .querySelectorAll("input[name='first'], input[name='second']")
  .forEach((input) => {
    input.addEventListener("change", updateChart);
  });

document.getElementById("mixed1").addEventListener("change", updateChart);
document.getElementById("mixed2").addEventListener("change", updateChart);
document.getElementById("index1").addEventListener("change", updateChart);
document.getElementById("index2").addEventListener("change", updateChart);
document.getElementById("stock1").addEventListener("change", updateChart);
document.getElementById("stock2").addEventListener("change", updateChart);
