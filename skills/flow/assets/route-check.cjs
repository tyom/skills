#!/usr/bin/env node
/* Checks the route a selection lights, against routes worked out by hand from
 * two small graphs below. Run it after touching shortestRoute() or upstream().
 *
 *     node assets/route-check.cjs
 *
 * The functions come out of app.js itself, sliced between two names rather than
 * copied, so a check can never pass against a stale duplicate. They are pure --
 * a flow index in, a route out -- so no DOM is needed to run them.
 */
'use strict';
var fs = require('fs'), path = require('path');

var src = fs.readFileSync(path.join(__dirname, '..', 'src', 'app.js'), 'utf8');
function slice(from, to) {
  var a = src.indexOf(from), b = src.indexOf(to, a);
  if (a === -1 || b === -1) throw new Error('app.js no longer holds ' + from);
  return src.slice(a, b + to.length);
}
var upstream = new Function(
  'var KIND_COLOR = {};\n' +
  slice('var KINDS = [', '];') + '\n' +
  slice('function kindOf(', '}') + '\n' +
  slice('var EDGE_KINDS = {', '};') + '\n' +
  slice('function edgeKind(', '}') + '\n' +
  slice('function unique(', '}') + '\n' +
  slice('function waysIn(', '\n  }') + '\n' +
  slice('function shortestRoute(', '\n  }') + '\n' +
  slice('function upstream(', '\n  }') + '\n' +
  'return upstream;'
)();

// A flow index is what the page builds from the JSON: nodes and edges by id,
// and each node's ways in and out.
function index(nodes, edges) {
  var f = { nodeById: {}, incoming: {}, outgoing: {}, edgeItems: [], edgeById: {} };
  nodes.forEach(function (n) { f.nodeById[n.id] = n; });
  edges.forEach(function (e, i) {
    e.id = 'e' + i;
    f.edgeItems.push(e);
    f.edgeById[e.id] = e;
    (f.incoming[e.to] = f.incoming[e.to] || []).push(e);
    (f.outgoing[e.from] = f.outgoing[e.from] || []).push(e);
  });
  return f;
}

// What preferring() hands shortestRoute: the walked steps in order.
function walked(trail) {
  var r = {};
  trail.forEach(function (n, i) { r[n] = i; });
  return r;
}

var bad = 0;
function is(what, got, want) {
  var ok = String(got) === String(want);
  if (!ok) bad++;
  console.log((ok ? 'ok   ' : 'FAIL ') + what + ': ' + got + (ok ? '' : ' (want ' + want + ')'));
}

// One decision, three branches, all reconverging. Walking down any branch must
// leave that branch as the way in, or up walks back to the wrong one.
var fan = index(
  [{ id: 's', kind: 'start' }, { id: 'd', kind: 'decision' },
   { id: 'a' }, { id: 'b' }, { id: 'c' }, { id: 'w' }],
  [{ from: 's', to: 'd' },
   { from: 'd', to: 'a' }, { from: 'd', to: 'b' }, { from: 'd', to: 'c' },
   { from: 'a', to: 'w' }, { from: 'b', to: 'w' }, { from: 'c', to: 'w' }]
);
['a', 'b', 'c'].forEach(function (branch) {
  var up = upstream(fan, 'w', walked(['s', 'd', branch, 'w']));
  is('walked down ' + branch + ', way into w',
     Object.keys(up.via).filter(function (p) { return up.via[p].to === 'w'; }), branch);
});
is('untrailed way into w', Object.keys(upstream(fan, 'w', null).via)
   .filter(function (p) { return upstream(fan, 'w', null).via[p].to === 'w'; }), 'a');

// A decision whose yes goes straight on and whose no takes a step first, so the
// long way round and the short way reach the same step. A search by shortest
// hop claims the decision by its yes edge, which drops the walked detour.
var detour = index(
  [{ id: 's', kind: 'start' }, { id: 'o', kind: 'decision' }, { id: 'a' }, { id: 't', kind: 'end' }],
  [{ from: 's', to: 'o' }, { from: 'o', to: 't' }, { from: 'o', to: 'a' }, { from: 'a', to: 't' }]
);
var via = upstream(detour, 't', walked(['s', 'o', 'a', 't'])).via;
is('walked the detour, way into t', via.a && via.a.to, 't');
is('walked the detour, o hands on to', via.o && via.o.to, 'a');
var dist = upstream(detour, 't', walked(['s', 'o', 'a', 't'])).dist;
is('walked the detour, o is hops up', dist.o, 2);
is('untrailed, o hands on to', upstream(detour, 't', null).via.o.to, 't');

process.exit(bad ? 1 : 0);
