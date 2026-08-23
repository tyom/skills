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
var api = new Function(
  'var KIND_COLOR = {};\n' +
  slice('var KINDS = [', '];') + '\n' +
  slice('function kindOf(', '}') + '\n' +
  slice('var EDGE_KINDS = {', '};') + '\n' +
  slice('function edgeKind(', '}') + '\n' +
  slice('function unique(', '}') + '\n' +
  slice('function waysIn(', '\n  }') + '\n' +
  slice('function shortestRoute(', '\n  }') + '\n' +
  slice('function upstream(', '\n  }') + '\n' +
  slice('function alongRoute(', '\n  }') + '\n' +
  'return { upstream: upstream, alongRoute: alongRoute };'
)();
var upstream = api.upstream, alongRoute = api.alongRoute;

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
// Walked whole, and walked only from the step above -- a reader who tapped the
// detour and then walked on leaves a trail that runs out partway, and the rest
// of the route back must still go through the step it does name.
[['s', 'o', 'a', 't'], ['a', 't']].forEach(function (trail) {
  var route = upstream(detour, 't', walked(trail));
  var of = 'trail ' + trail.join('>') + ', ';
  is(of + 'way into t', route.via.a && route.via.a.to, 't');
  is(of + 'o hands on to', route.via.o && route.via.o.to, 'a');
  is(of + 'o is hops up', route.dist.o, 2);
});
is('untrailed, o hands on to', upstream(detour, 't', null).via.o.to, 't');

// The shortcut edge runs between two lit nodes, but it arrives where the route
// arrives having missed out the step the route went through.
function edgeFrom(f, from, to) {
  return f.edgeItems.filter(function (e) { return e.from === from && e.to === to; })[0];
}
var walkedDist = upstream(detour, 't', walked(['a', 't'])).dist;
is('walked the detour, the shortcut lights',
   alongRoute(walkedDist, edgeFrom(detour, 'o', 't')), false);
is('walked the detour, the way in lights',
   alongRoute(walkedDist, edgeFrom(detour, 'a', 't')), true);
is('walked the detour, the step down to it lights',
   alongRoute(walkedDist, edgeFrom(detour, 'o', 'a')), true);

// Untrailed the route takes the shortcut, and the step it skips is hung off it
// at -1 by the caller. The edge that hangs it there is not a jump.
var restDist = upstream(detour, 't', null).dist;
restDist.a = -1;
is('untrailed, the shortcut lights',
   alongRoute(restDist, edgeFrom(detour, 'o', 't')), true);
is('untrailed, the step hung off the route keeps its edges',
   alongRoute(restDist, edgeFrom(detour, 'o', 'a')) &&
   alongRoute(restDist, edgeFrom(detour, 'a', 't')), true);

process.exit(bad ? 1 : 0);
