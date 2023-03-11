const https = require('https');

Array.prototype.sum = function() {
  return this.reduce(function(a, b) {return a+b});
};

function report(data, cb) {
  var buffer = `# PC specs report

Generated: {date}

This document helps inform future PC hardware buying decisions. Our hope is to
be able to play Star Citizen with medium-high settings, 1920x1080 and >= 20 FPS.

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
      ['cpu', 'gpu'].forEach(t => {
        if(!(('most_common_' + t) in gb) ||
          typeof gb['most_common_' + t] != 'object') return;
        gb['most_common_' + t].forEach(mc => {
          if(!Object.keys(buffer[t]).includes(mc))
            buffer[t][mc] = {'name': mc, 'avgs': [], 'percentiles': {}};
          if(apv) {
            Object.keys(apv).forEach(p => {
              if(!Object.keys(buffer[t][mc].percentiles).includes(p))
                buffer[t][mc].percentiles[p] = [];
              buffer[t][mc].percentiles[p].push(apv[p]);
            });
          }
          buffer[t][mc].avgs.push(gb.avg_fps.value);
        });
      });
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

https.get('https://robertsspaceindustries.com/api/telemetry/v2/performanceheatmap/?sys_spec_min=4.0&sys_spec_max=4.0&timetable=DAY&branch=sc-alpha-3.17&cpu_interval=25&gpu_interval=25&howmany=3&scrwidth=1920&scrheight=1080', res => {
  let data = [];
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
