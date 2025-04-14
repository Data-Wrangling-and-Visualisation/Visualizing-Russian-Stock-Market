const width = 800,
  height = 500,
  margin = { top: 20, right: 30, bottom: 50, left: 50 };
const innerWidth = width - margin.left - margin.right;
const innerHeight = height - margin.top - margin.bottom;

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

let x = d3.scaleTime().range([0, innerWidth]);
let y = d3.scaleLinear().range([innerHeight, 0]);

const xAxis = g
  .append("g")
  .attr("class", "axis axis--x")
  .attr("transform", `translate(0,${innerHeight})`);
const yAxis = g.append("g").attr("class", "axis axis--y");

let indexData = {};
const colors = {
  SP500: "#1f77b4",
  NASDAQ: "#ff7f0e",
  DJI: "#2ca02c",
  RTSI: "#d62728",
  IMOEX: "#9467bd",
};

fetch("http://localhost:5500/api/data/index")
  .then((response) => response.json())
  .then((data) => {
    indexData = data.reduce((acc, d) => {
      const index = d.INDEX_TICK;
      if (!acc[index]) acc[index] = [];
      acc[index].push({ date: d.begin.split(" ")[0], value: +d.close });
      return acc;
    }, {});
    populateSelectors(Object.keys(indexData));
    updateChart();
  })
  .catch((err) => console.error("Ошибка загрузки данных индексов:", err));

function populateSelectors(indexNames) {
  const select1 = document.getElementById("index1");
  const select2 = document.getElementById("index2");
  select1.innerHTML = "";
  select2.innerHTML = "";

  indexNames.forEach((name) => {
    select1.add(new Option(name, name));
    select2.add(new Option(name, name));
  });
  if (indexNames.length >= 2) select2.selectedIndex = 1;
}

function updateChart() {
  const index1 = document.getElementById("index1").value;
  const index2 = document.getElementById("index2").value;

  if (!indexData[index1] || !indexData[index2]) return;
  if (index1 === index2) {
    alert("Выберите разные индексы!");
    return;
  }
  const unique = (arr) =>
    Array.from(
      new Map(arr.map((item) => [item.date.toISOString(), item])).values()
    );

  const data1 = unique(
    indexData[index1].map((d) => ({
      date: new Date(d.date),
      value: d.value,
    }))
  );

  const data2 = unique(
    indexData[index2].map((d) => ({
      date: new Date(d.date),
      value: d.value,
    }))
  );

  const base1 = data1[0].value;
  const base2 = data2[0].value;

  const normalized1 = data1.map((d) => ({
    date: d.date,
    value: (d.value / base1 - 1) * 100,
  }));
  const normalized2 = data2.map((d) => ({
    date: d.date,
    value: (d.value / base2 - 1) * 100,
  }));
  normalized1.sort((a, b) => a.date - b.date);
  normalized2.sort((a, b) => a.date - b.date);

  const combinedData = [...normalized1, ...normalized2];

  x.domain(d3.extent(combinedData, (d) => d.date));
  y.domain([
    d3.min(combinedData, (d) => d.value) * 1.05,
    d3.max(combinedData, (d) => d.value) * 1.05,
  ]);

  xAxis.call(d3.axisBottom(x));
  yAxis.call(d3.axisLeft(y).tickFormat((d) => d.toFixed(1) + "%"));

  svg.selectAll(".line").remove();

  const line = d3
    .line()
    .defined((d) => d.value != null)
    .x((d) => x(d.date))
    .y((d) => y(d.value));

  const path1 = svg
    .append("path")
    .datum(normalized1)
    .attr("class", "line line1")
    .attr("stroke", "steelblue")
    .attr("stroke-opacity", 0.8)
    .attr("fill", "none")
    .attr("stroke-width", 2)
    .attr("d", line);

  const path2 = svg
    .append("path")
    .datum(normalized2)
    .attr("class", "line line2")
    .attr("stroke", "tomato")
    .attr("stroke-opacity", 0.8)
    .attr("fill", "none")
    .attr("stroke-width", 2)
    .attr("d", line);

  path1
    .on("mouseover", () => {
      path1.attr("stroke-opacity", 1);
      path2.attr("stroke-opacity", 0.1);
    })
    .on("mouseout", () => {
      path1.attr("stroke-opacity", 0.8);
      path2.attr("stroke-opacity", 0.8);
    });

  path2
    .on("mouseover", () => {
      path2.attr("stroke-opacity", 1);
      path1.attr("stroke-opacity", 0.1);
    })
    .on("mouseout", () => {
      path1.attr("stroke-opacity", 0.8);
      path2.attr("stroke-opacity", 0.8);
    });
}

document.getElementById("index1").addEventListener("change", updateChart);
document.getElementById("index2").addEventListener("change", updateChart);
