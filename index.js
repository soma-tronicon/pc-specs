const https = require('https');

Array.prototype.sum = function() {
  return this.reduce(function(a, b) {return a+b});
};

function report(data, cb) {
  var buffer = `# PC specs report

Generated: {date}

## Star citizen specs

### CPUs

{cpu-results}

### GPUs

{gpu-results}
`;

  Object.keys(data).forEach(d => {
    buffer = buffer.replace('{' + d + '-results}', data[d].map(i => {
      return '* ' + i.name + ' (avg FPS = ' + Math.round(i.avg) + ', 1% FPS = ' + Math.round(i.p_1) + ')';
    }).join('\n'));
  });
  return cb(buffer.replace('{date}', new Date().toLocaleString()));
}

function generate(obj, cb) {
  var buffer = {'gpu': {}, 'cpu': {}};
  var cpu_buckets = obj.data.aggregations.cpu_hist.buckets;
  cpu_buckets.forEach((cb, cbi) => {
    var gpu_buckets = cb.gpu_hist.buckets;
    gpu_buckets.forEach((gb, gbi) => {
      var apv = gb.avgfps_percentiles.values;
      if('most_common_gpu' in gb && typeof gb.most_common_gpu == 'object') {
        gb.most_common_gpu.forEach(mcg => {
          if(!Object.keys(buffer.gpu).includes(mcg))
            buffer.gpu[mcg] = {'name': mcg, 'avgs': [], 'percentiles': {}};
          if(apv) {
            Object.keys(apv).forEach(p => {
              if(!Object.keys(buffer.gpu[mcg].percentiles).includes(p))
                buffer.gpu[mcg].percentiles[p] = [];
              buffer.gpu[mcg].percentiles[p].push(apv[p]);
            });
          }
          buffer.gpu[mcg].avgs.push(gb.avg_fps.value);
        });
      }
      if('most_common_cpu' in gb && typeof gb.most_common_cpu == 'object') {
        gb.most_common_cpu.forEach(mcc => {
          if(!Object.keys(buffer.cpu).includes(mcc))
            buffer.cpu[mcc] = {'name': mcc, 'avgs': [], 'percentiles': {}};
          if(apv) {
            Object.keys(apv).forEach(p => {
              if(!Object.keys(buffer.cpu[mcc].percentiles).includes(p))
                buffer.cpu[mcc].percentiles[p] = [];
              buffer.cpu[mcc].percentiles[p].push(apv[p]);
            });
          }
          buffer.cpu[mcc].avgs.push(gb.avg_fps.value);
        });
      }
    });
  });
  var res = {
    'cpu': Object.values(buffer.cpu),
    'gpu': Object.values(buffer.gpu)
  };
  Object.keys(res).forEach(k => {
    res[k].forEach(i => {
      i.avg = (i.avgs.sum() / i.avgs.length);
      if('1.0' in i.percentiles)
        i['p_1'] = i.percentiles['1.0'].sum() / i.percentiles['1.0'].length;
      delete i.percentiles;
      delete i.avgs;
    });
  });
  res.cpu.sort((a, b) => (a.avg > b.avg) ? 1 : -1);
  res.gpu.sort((a, b) => (a.avg > b.avg) ? 1 : -1);
  cb(res);
}

https.get('https://robertsspaceindustries.com/api/telemetry/v2/performanceheatmap/?sys_spec_min=0.0&sys_spec_max=4.0&timetable=DAY&branch=sc-alpha-3.17&cpu_interval=25&gpu_interval=25&howmany=3', res => {
  let data = [];
  const headerDate = res.headers && res.headers.date ? res.headers.date : 'no response date';

  res.on('data', chunk => {
    data.push(chunk);
  });

  res.on('end', () => {
    generate(JSON.parse(Buffer.concat(data).toString()), buf => {
      report(buf, r => console.log(r));
    });
  });
}).on('error', err => {
  console.log('Error: ', err.message);
});
