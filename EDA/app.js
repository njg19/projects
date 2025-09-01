let weatherData = [];
var tileCharts = {};
const cToF = (c) => (c * 9/5 + 32); // Conversion helper for C to F

var chartTiles = {
  'temp-tile': renderDCSelection,
  'precip-tile': renderPrecipChart,
  'condition-tile': renderAvgTempTable,
  'wind-tile': renderSummer2023TempHumidity,
  'sankey-tile': renderSankey
};

window.onload = async function() {
  var res = await fetch('weather_dc.json');
  weatherData = await res.json();
  // Render charts
  Object.entries(chartTiles).forEach(([tileId, renderFn]) => {
    initTile(tileId, renderFn);
  });
};

function initTile(tileId, renderFn) {
  var tile = document.getElementById(tileId);
  tileCharts[tileId] = renderFn(tile);
}


/*
DC Chart + Tables
*/

function renderPrecipChart(tile) {
    // Prepare data
    var annualTotals = {};
    weatherData.forEach(d => {
        var year = new Date(d.datetime).getFullYear();
        annualTotals[year] = (annualTotals[year] || 0) + Number(d.precip);
    });

    var years = [2017, 2018, 2019, 2020, 2021, 2022, 2023];
    var labels = years.map(String);
    var precip = years.map(y => annualTotals[y] || 0);

    // Create a div for Plotly
    var chartDiv = document.createElement('div');
    tile.appendChild(chartDiv);

    // Define trace
    var trace = {
        x: labels,
        y: precip,
        type: 'bar',
        marker: { color: 'lightblue' },
        text: precip.map(v => v + ' mm'), // hover text
        hoverinfo: 'text'
    };

    // Define layout
    var layout = {
        width: 300,
        height: 200,
        responsive: true,
        paper_bgcolor: 'rgba(0,0,0,0)', // No background colors
        plot_bgcolor: 'rgba(0,0,0,0)', // No background colors
        xaxis: {
            tickvals: labels,
            ticktext: labels.map(l => "'" + l.slice(-2)) // So year fits on labels
        },
        yaxis: {
            showticklabels: false,
            label: "Year"
        },
        showlegend: false,
        margin: { t: 20, r: 20, l: 40, b: 40 }
    };

    Plotly.newPlot(chartDiv, [trace], layout);
}

function renderAvgTempTable(tile) {
  var months = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
  var monthlyTemps = Array(12).fill(null).map(() => []);

  // Collect temperatures for each month (across all years)
  weatherData.forEach(d => {
    var dt = new Date(d.datetime);
    var month = dt.getMonth();
    var temp = parseFloat(d.temp);
    if (!isNaN(temp)) monthlyTemps[month].push(temp);
  });

  // Compute average per month
  var avgTempsC = monthlyTemps.map(wd => {
    var sum = wd.reduce((a,b) => a + b, 0);
    return (sum / wd.length).toFixed(1);
  });

  // Conversion C to F
  var avgTempsF = avgTempsC.map(t => t !== null ? (t * 9/5 + 32).toFixed(1) : "-");

  // Create table element
  var table = document.createElement('table');
  var thead = document.createElement('thead');
  var headerRow = document.createElement('tr');
  ["Month", "Avg Temp (°F)"].forEach(text => {
    var th = document.createElement('th');
    th.innerText = text;
    headerRow.appendChild(th);
  });
  thead.appendChild(headerRow);
  table.appendChild(thead);

  // Table body
  var tbody = document.createElement('tbody');
  months.forEach((month, i) => {
    var tr = document.createElement('tr');
    var tdMonth = document.createElement('td');
    tdMonth.innerText = month;
    tr.appendChild(tdMonth);

    var tdTemp = document.createElement('td');
    tdTemp.innerText = avgTempsF[i] !== null ? avgTempsF[i] : "-";
    tr.appendChild(tdTemp);
    tbody.appendChild(tr);
  });
  
  table.appendChild(tbody);
  tile.appendChild(table);
}

function renderDCSelection(tile) {
    // Years to compare
    var years = [2017, 2023];

    // Available y-axis options
    var yOptions = ['temp','dew','humidity','precip','windspeed'];
    var initialY = 'temp';

    // Prepare monthly averages for each year
    var monthlyData = years.map(year => {
        // Filter data for that year
        var yearData = weatherData.filter(d => new Date(d.datetime).getFullYear() === year);
        
        // Initialize 12 months
        var months = Array.from({length:12}, (_,i) => i+1);
        var monthValues = months.map(m => {
            var monthData = yearData.filter(d => new Date(d.datetime).getMonth()+1 === m);
            if (monthData.length === 0) return null;
            var sum = monthData.reduce((acc,d) => acc + Number(d[initialY]), 0);
            return sum / monthData.length;
        });
        return monthValues;
    });

    // Create traces
    var traces = years.map((year, idx) => ({
        x: ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'],
        y: monthlyData[idx],
        mode: 'lines+markers',
        name: year.toString()
    }));

    // Clear tile and add chart div
    tile.innerHTML = '<h3>Monthly Weather Comparisons: 2017 vs 2023</h3>';
    var chartDiv = document.createElement('div');
    chartDiv.style.width = '100%';
    chartDiv.style.height = '500px';
    tile.appendChild(chartDiv);

    // Layout with dropdown to select y-axis metric
    var layout = {
        xaxis: { title: 'Month' },
        yaxis: { title: initialY },
        paper_bgcolor: 'rgba(0,0,0,0)',
        plot_bgcolor: 'rgba(0,0,0,0)',
        updatemenus: [{
            y: 1.1,
            yanchor: 'top',
            x: 0.35,
            xanchor: 'right',
            buttons: yOptions.map(option => ({
                method: 'update',
                label: option,
                args: [
                    { y: years.map(year => {
                        var yearData = weatherData.filter(d => new Date(d.datetime).getFullYear() === year);
                        return Array.from({length:12}, (_,m) => {
                            var monthData = yearData.filter(d => new Date(d.datetime).getMonth()+1 === m+1);
                            if (monthData.length === 0) return null;
                            return monthData.reduce((acc,d) => acc + Number(d[option]),0) / monthData.length;
                        });
                    })},
                    { yaxis: { title: option } }
                ]
            }))
        }]
    };

    Plotly.newPlot(chartDiv, traces, layout, {responsive: true});
}

// Helper function for Sankey chart
function simplifyCondition(cond) {
  if (!cond) return 'Unknown';
  cond = cond.toLowerCase();
  if (cond.includes('snow') || cond.includes('ice') || cond.includes('freezing')) 
    return 'Snow/Ice';
  if (cond.includes('rain') || cond.includes('drizzle')) 
    return 'Rain';
  if (cond.includes('clear')) 
    return 'Clear';
  if (cond.includes('partially cloudy') || cond.includes('partly cloudy')) 
    return 'Partly Cloudy';
  if (cond.includes('overcast') || cond.includes('cloudy')) 
    return 'Overcast';
  return 'Other';
}

function renderSankey(tile) {
  const cToF = (c) => (c * 9/5 + 32); // Conversion

  const earthBin = (tC) => {
    const t = cToF(Number(tC));
    if (isNaN(t)) return 'N/A';
    if (t >= 86) return '≥86°F';
    if (t >= 68) return '68–85°F';
    if (t >= 50) return '50–67°F';
    if (t >= 32) return '32–49°F';
    return '<32°F';
  };

  // flows
  const flowCounts = {};
  (weatherData || []).forEach(e => {
    const tempBand = earthBin(e.temp);
    const condition = simplifyCondition(e.conditions);
    const key = `${tempBand}__${condition}`;
    flowCounts[key] = (flowCounts[key] || 0) + 1;
  });

  const keys = Object.keys(flowCounts);
  if (keys.length === 0) {
    const msg = document.createElement('div');
    msg.textContent = 'No Earth weather data to build Sankey.';
    msg.style.fontSize = '12px';
    tile.appendChild(msg);
    return;
  }

  // labels
  const tempOrder = ['≥86°F','68–85°F','50–67°F','32–49°F','<32°F'];
  const conditionSet = new Set();
  keys.forEach(k => {
    const [_, cond] = k.split('__');
    conditionSet.add(cond);
  });

  const sourceLabels = tempOrder.filter(t => keys.some(k => k.startsWith(t)));
  const targetLabels = Array.from(conditionSet);
  const labels = [...sourceLabels, ...targetLabels];

  // colors
  const tempColors = {
    '≥86°F': 'rgba(214,39,40,0.6)',
    '68–85°F': 'rgba(255,127,14,0.6)',
    '50–67°F': 'rgba(255,196,77,0.6)',
    '32–49°F': 'rgba(164,247,161,0.6)',
    '<32°F': 'rgba(148,103,189,0.6)',
    'N/A': 'rgba(127,127,127,0.3)'
  };
  const conditionColors = {
    'Clear': 'rgba(255,223,0,0.6)',
    'Partly Cloudy': 'rgba(135,206,250,0.6)',
    'Overcast': 'rgba(169,169,169,0.6)',
    'Rain': 'rgba(30,144,255,0.6)',
    'Snow/Ice': 'rgba(240,248,255,0.6)',
    'Unknown': 'rgba(200,200,200,0.3)',
    'Other': 'rgba(200,200,200,0.3)'
  };
  const nodeColors = labels.map(label => {
    if (sourceLabels.includes(label)) return tempColors[label] || 'rgba(200,200,200,0.6)';
    else return conditionColors[label] || 'rgba(150,150,150,0.6)';
  });

  // Ordering
  const nodeY = [];
  const numSource = sourceLabels.length;
  const numTarget = targetLabels.length;
  sourceLabels.forEach((_, i) => nodeY.push(i / (numSource - 1)));
  targetLabels.forEach((_, i) => nodeY.push(i / (numTarget - 1)));

  // --- Link indices and colors ---
  const indexOf = (label) => labels.indexOf(label);
  const sourceIndices = [];
  const targetIndices = [];
  const values = [];
  const linkColors = [];

  keys.forEach(k => {
    const [s, t] = k.split('__');
    sourceIndices.push(indexOf(s));
    targetIndices.push(indexOf(t));
    values.push(flowCounts[k]);
    linkColors.push(tempColors[s] || 'rgba(153,153,153,0.4)'); // link colored by source temp
  });

  const chartDiv = document.createElement('div');
  tile.appendChild(chartDiv);

  const data = [{
    type: "sankey",
    orientation: "h",
    node: {
      label: labels,
      pad: 10,
      thickness: 12,
      line: { width: 0.5 },
      color: nodeColors,
      y: nodeY
    },
    link: {
      source: sourceIndices,
      target: targetIndices,
      value: values,
      color: linkColors,
      hovertemplate: "%{source.label} → %{target.label}<br>%{value} days<extra></extra>"
    }
  }];

  const layout = {
    responsive: true,
    height: 350,
    paper_bgcolor: 'rgba(0,0,0,0)',
    margin: { t: 10, r: 10, l: 10, b: 10 }
  };

  Plotly.newPlot(chartDiv, data, layout);
}



function renderSummer2023TempHumidity(tile) {
  // Filter for June, July, August of 2023
  const summer2023 = weatherData.filter(d => {
    const dt = new Date(d.datetime);
    const year = dt.getFullYear();
    const month = dt.getMonth() + 1; // JS months 0-11
    return year === 2023 && (month === 6 || month === 7 || month === 8);
  });

  const dates = summer2023.map(d => d.datetime);
  const temps = summer2023.map(d => parseFloat(d.temp));       // °C in your data
  const humidity = summer2023.map(d => parseFloat(d.humidity));

  // Convert °C to °F
  const tempsF = temps.map(t => (t * 9/5) + 32);

  const traceTemp = {
    x: dates,
    y: tempsF,
    type: "scatter",
    mode: "lines+markers",
    name: "Temperature (°F)",
    line: { color: "rgba(255, 99, 71, 0.9)", width: 2 },
    marker: { color: "rgba(255, 99, 71, 0.9)", size: 5 },
    yaxis: "y1"
  };

  const traceHumidity = {
    x: dates,
    y: humidity,
    type: "scatter",
    mode: "lines+markers",
    name: "Humidity (%)",
    line: { color: "rgba(30, 144, 255, 0.9)", width: 2, dash: "dot" },
    marker: { color: "rgba(30, 144, 255, 0.9)", size: 5 },
    yaxis: "y2"
  };

  const layout = {
    width: 500,
    height: 300,
    paper_bgcolor: 'rgba(0,0,0,0)',
    plot_bgcolor: 'rgba(0,0,0,0)',
    yaxis: { title: "Temperature (°F)", side: "left" },
    yaxis2: {
      title: "Humidity (%)",
      overlaying: "y",
      side: "right",
      range: [0, 100]
    },
    margin: { t: 50, l: 60, r: 60, b: 40 },
    legend: { orientation: "h", y: -0.3 }
  };

  const chartDiv = document.createElement('div');
  tile.appendChild(chartDiv);

  Plotly.newPlot(chartDiv, [traceTemp, traceHumidity], layout);
}
