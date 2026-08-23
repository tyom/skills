import * as React from 'react';
import * as ReactDOM from 'react-dom/client';
import * as ReactFlow from '@xyflow/react';
import * as dagre from '@dagrejs/dagre';
import '@xyflow/react/dist/style.css';
import './style.css';

(function () {
  'use strict';

  var h = React.createElement;
  var RF = ReactFlow;
  var useState = React.useState, useMemo = React.useMemo,
      useCallback = React.useCallback, useEffect = React.useEffect,
      useRef = React.useRef;

  // Shared so the load fit and every relayout fit agree; the two drifting apart
  // frames the graph differently depending on how you got there.
  var FIT = { padding: 0.15, minZoom: 0.7 };

  // Where to point the canvas when the fit stops at the readable floor and the
  // graph runs off the edge. Centring on the step in hand is right until that
  // step is near an end of the flow, where it leaves half the canvas empty; the
  // centre is held far enough in for the viewport to stay over the graph.
  function held(at, min, max, span) {
    var reach = span / FIT.minZoom, edge = reach * FIT.padding;
    if (max - min + edge * 2 <= reach) return (min + max) / 2;
    return clamp(at, min - edge + reach / 2, max + edge - reach / 2);
  }

  // Width grows with the level. Height does not need to: heightOf measures the
  // real box, so the taller type and padding come back on their own.
  function widthOf(kind, level) {
    var base = kind === 'decision' ? 240 : 190;
    return base + (level === 'h1' ? 140 : level === 'h2' ? 40 : 0);
  }

  // ponytail: estimated from the character count rather than measured. An 11px
  // proportional font puts this a few pixels out, which the gaps absorb.
  // Tracks .edge-label's font-size and horizontal padding; change those together.
  function labelWidth(text) { return text.length * 5.9 + 10; }

  // dagre needs a height before React has rendered anything, and a guess is
  // wrong the moment a note wraps: the box then grows past the rect the route
  // was aimed at, and an arrowhead arriving at the bottom face hides under it.
  // So the body is measured off screen, once per distinct node. The markup here
  // mirrors FlowNode's; change one, change the other.
  var probe = document.createElement('div');
  probe.style.cssText = 'position:absolute;left:-9999px;top:0;visibility:hidden';
  document.body.appendChild(probe);
  var measured = Object.create(null);

  function bodyLine(cls, text) {
    var el = document.createElement('div');
    el.className = cls;
    el.textContent = text;
    return el;
  }

  function heightOf(n) {
    if (isBar(n.kind)) return 22;
    var kind = kindOf(n.kind), level = levelOf(n), label = n.label || n.id;
    // The level is in the key as well as on the class: without it the same
    // label at two levels shares one entry and the second gets the first's box.
    var key = [kind, level, label, n.note || '', n.ref || ''].join('\u0000');
    if (measured[key] === undefined) {
      var box = document.createElement('div'), body = document.createElement('div');
      box.className = 'node node-' + kind + (level ? ' ' + level : '');
      box.style.width = widthOf(kind, level) + 'px';
      body.className = 'body';
      body.appendChild(bodyLine('label', label));
      if (n.note) body.appendChild(bodyLine('note', n.note));
      // A ref is one line whatever it holds, since .ref .name ellipsises, but
      // it has to be measured inside that span to stay one.
      if (n.ref) {
        var ref = bodyLine('ref', '');
        ref.appendChild(bodyLine('name', n.ref));
        body.appendChild(ref);
      }
      box.appendChild(body);
      probe.appendChild(box);
      measured[key] = box.offsetHeight;
      probe.removeChild(box);
    }
    return measured[key];
  }

  // SVG fills and the minimap don't resolve CSS vars, so the palette is read
  // out of the stylesheet once. Changing this list or any .node-* rule: build
  // assets/kinds-probe.json, which renders every kind and awkward graph shape.
  var KINDS = ['start', 'step', 'decision', 'io', 'store', 'end', 'success', 'fork', 'join', 'state'];
  var css = getComputedStyle(document.documentElement);
  var KIND_COLOR = KINDS.reduce(function (m, k) {
    m[k] = css.getPropertyValue('--' + k).trim();
    return m;
  }, Object.create(null));
  var ACCENT = css.getPropertyValue('--accent').trim();
  var MUTED = css.getPropertyValue('--muted').trim();

  // Unknown kinds fall back to 'step'; build.py calls one out as a problem.
  function kindOf(kind) { return KINDS.indexOf(kind) === -1 ? 'step' : kind; }
  function isBar(kind) { return kind === 'fork' || kind === 'join'; }
  // A level a stylesheet has no rule for falls back to the base node, and so
  // does a level on a bar — a bar is pinned to its height and shows one line.
  // build.py calls both out as problems.
  function levelOf(n) {
    return !isBar(n.kind) && (n.level === 'h1' || n.level === 'h2') ? n.level : '';
  }

  // Everything an edge kind means, in one row: its legend entry, its colour and
  // its dash. `progress: false` marks a kind that does not carry the flow
  // forward, so the upstream walk stops rather than crossing it — a retry points
  // back around a loop, and walking it would light sibling outcomes from earlier
  // iterations. Insertion order is the legend's order.
  var EDGE_KINDS = {
    '': { label: 'Flow' },
    async: { label: 'Async', dash: '7 5' },
    retry: { label: 'Retry', color: KIND_COLOR.decision, dash: '2 5', progress: false },
    error: { label: 'Error', color: KIND_COLOR.end, dash: '10 4 2 4' }
  };
  function edgeKind(kind) { return EDGE_KINDS[kind] || EDGE_KINDS['']; }

  // Closes over nothing, so the minimap's memoised nodes keep their identity.
  function nodeColorOf(n) { return KIND_COLOR[n.data.kind]; }

  // Private to whoever opens the page, and absent in a locked-down browser.
  var MAP_KEY = 'flow:minimap';
  function readToggle(key) {
    try { return localStorage.getItem(key) !== '0'; } catch (e) { return true; }
  }
  function writeToggle(key, on) {
    try { localStorage.setItem(key, on ? '1' : '0'); } catch (e) { /* no store */ }
  }

  function fileName(title, ext) {
    var base = (title || 'flow').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
    return (base || 'flow') + '.' + ext;
  }

  function download(blob, name) {
    var url = URL.createObjectURL(blob);
    var link = document.createElement('a');
    link.href = url; link.download = name;
    document.body.appendChild(link); link.click(); link.remove();
    setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
  }

  function exportBounds(nodes, root) {
    var box = nodes.reduce(function (b, n) {
      var w = n.width || n.data.width || 0, ht = n.height || n.data.height || 0;
      b.x1 = Math.min(b.x1, n.position.x); b.y1 = Math.min(b.y1, n.position.y);
      b.x2 = Math.max(b.x2, n.position.x + w); b.y2 = Math.max(b.y2, n.position.y + ht);
      return b;
    }, { x1: Infinity, y1: Infinity, x2: -Infinity, y2: -Infinity });
    root.querySelectorAll('.react-flow__edge').forEach(function (edge) {
      try {
        var e = edge.getBBox();
        box.x1 = Math.min(box.x1, e.x); box.y1 = Math.min(box.y1, e.y);
        box.x2 = Math.max(box.x2, e.x + e.width); box.y2 = Math.max(box.y2, e.y + e.height);
      } catch (ignore) { /* detached SVG */ }
    });
    return box;
  }

  function svgExport(nodes, title, withBackground) {
    var source = document.querySelector('.canvas .react-flow');
    if (!source) throw new Error('Flow canvas not found');
    var clone = source.cloneNode(true), bounds = exportBounds(nodes, source), pad = 32;
    var graphWidth = Math.ceil(bounds.x2 - bounds.x1 + pad * 2);
    var graphHeight = Math.ceil(bounds.y2 - bounds.y1 + pad * 2);
    var width = Math.max(640, graphWidth), headHeight = 64, height = graphHeight + headHeight;
    var canvas = source.closest('.canvas');
    var theme = getComputedStyle(canvas);
    var bodyStyle = getComputedStyle(document.body);
    var sheet = document.createElement('div'), head = document.createElement('div');
    var heading = document.createElement('div'), legend = source.querySelector('.edge-legend').cloneNode(true);
    sheet.className = canvas.classList.contains('canvas-dark') ? 'canvas-dark' : 'canvas-light';
    sheet.style.width = width + 'px'; sheet.style.height = height + 'px';
    if (withBackground) sheet.style.background = theme.getPropertyValue('--bg');
    sheet.style.color = theme.getPropertyValue('--ink');
    sheet.style.fontFamily = bodyStyle.fontFamily;
    sheet.style.fontSize = bodyStyle.fontSize;
    sheet.style.lineHeight = bodyStyle.lineHeight;
    head.style.cssText = 'height:' + headHeight + 'px;display:flex;align-items:center;' +
      'justify-content:space-between;gap:24px;padding:0 20px;border-bottom:1px solid ' +
      theme.getPropertyValue('--line');
    heading.textContent = title;
    heading.style.cssText = 'overflow:hidden;text-overflow:ellipsis;white-space:nowrap;' +
      'font-size:16px;font-weight:600;';
    legend.classList.remove('react-flow__panel');
    legend.removeAttribute('style');
    legend.style.display = 'flex';
    head.appendChild(heading); head.appendChild(legend);
    clone.style.width = width + 'px'; clone.style.height = graphHeight + 'px';
    if (withBackground) clone.style.background = theme.getPropertyValue('--bg');
    clone.style.color = theme.getPropertyValue('--ink');
    clone.style.fontFamily = bodyStyle.fontFamily;
    clone.style.fontSize = bodyStyle.fontSize;
    clone.style.lineHeight = bodyStyle.lineHeight;
    clone.querySelectorAll('.react-flow__controls, .react-flow__minimap, .react-flow__panel')
      .forEach(function (el) { el.remove(); });
    clone.querySelector('.react-flow__viewport').style.transform =
      'translate(' + (pad + (width - graphWidth) / 2 - bounds.x1) + 'px,' +
      (pad - bounds.y1) + 'px) scale(1)';
    sheet.appendChild(head); sheet.appendChild(clone);
    var styles = Array.from(document.querySelectorAll('style'))
      .map(function (style) { return style.textContent; }).join('\n');
    var body = new XMLSerializer().serializeToString(sheet);
    var svg = '<svg xmlns="http://www.w3.org/2000/svg" width="' + width +
      '" height="' + height + '" viewBox="0 0 ' + width + ' ' + height + '">' +
      '<foreignObject width="100%" height="100%"><div xmlns="http://www.w3.org/1999/xhtml">' +
      // The sheet is parsed as XML, so the CSS is markup there: an unescaped
      // '<' in a comment or a content string opens a tag that never closes.
      '<style>' + styles.replace(/&/g, '&amp;').replace(/</g, '&lt;') + '</style>' + body +
      '</div></foreignObject></svg>';
    return {
      blob: new Blob([svg], { type: 'image/svg+xml;charset=utf-8' }),
      dataUrl: 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg),
      width: width, height: height
    };
  }

  function exportFlow(nodes, title, format, withBackground) {
    var image = svgExport(nodes, title, withBackground);
    if (format === 'svg') {
      download(image.blob, fileName(title, 'svg'));
      return Promise.resolve();
    }
    return new Promise(function (resolve, reject) {
      var preview = new Image();
      preview.crossOrigin = 'anonymous';
      preview.onload = function () {
        var scale = Math.min(2, 16000 / image.width, 16000 / image.height,
          Math.sqrt(100000000 / (image.width * image.height)));
        var canvas = document.createElement('canvas');
        canvas.width = Math.max(1, Math.floor(image.width * scale));
        canvas.height = Math.max(1, Math.floor(image.height * scale));
        var context = canvas.getContext('2d');
        context.scale(scale, scale); context.drawImage(preview, 0, 0);
        canvas.toBlob(function (blob) {
          if (!blob) { reject(new Error('PNG encoding failed')); return; }
          download(blob, fileName(title, 'png')); resolve();
        }, 'image/png');
      };
      preview.onerror = function () { reject(new Error('SVG rendering failed')); };
      preview.src = image.dataUrl;
    });
  }

  var doc = JSON.parse(document.getElementById('flow-data').textContent);

  // Each tab is an independent graph: its own ids, its own validation, its own
  // adjacency. Nothing crosses between them. build.py normalises the one-diagram
  // shorthand into this array, so there is always at least one.
  function prepare(flow) {
    var nodeList = flow.nodes || [], edgeList = flow.edges || [];
    var known = nodeList.reduce(function (m, n) { m[n.id] = true; return m; }, Object.create(null));

    var edgeItems = edgeList
      .filter(function (e) { return known[e.from] && known[e.to]; })
      .map(function (e, i) {
        return {
          id: 'e' + i, from: e.from, to: e.to,
          label: e.label || '', kind: e.kind || '', detail: e.detail || '',
          links: e.links || null
        };
      });

    var incoming = Object.create(null), outgoing = Object.create(null);
    edgeItems.forEach(function (e) {
      (incoming[e.to] || (incoming[e.to] = [])).push(e);
      (outgoing[e.from] || (outgoing[e.from] = [])).push(e);
    });

    return {
      title: flow.title || '', summary: flow.summary || '', links: flow.links || null,
      nodeList: nodeList, edgeItems: edgeItems,
      // build.py checked this graph and wrote its verdict in, so the badge on
      // the page and the build output cannot disagree.
      problems: flow.problems || [],
      incoming: incoming, outgoing: outgoing,
      edgeById: edgeItems.reduce(function (m, e) { m[e.id] = e; return m; }, Object.create(null)),
      nodeById: nodeList.reduce(function (m, n) { m[n.id] = n; return m; }, Object.create(null))
    };
  }

  var flows = doc.flows.map(prepare);
  var usedTabIds = Object.create(null);
  var tabIds = flows.map(function (f, i) {
    var fallback = 'flow-' + (i + 1);
    var base = (f.title || fallback).toLowerCase()
      .replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || fallback;
    // Two flows can share a title, and the hash has to address one tab only.
    var id = base, n = i;
    while (usedTabIds[id]) id = base + '-' + (++n);
    usedTabIds[id] = true;
    return id;
  });

  function tabFromHash() {
    return Math.max(0, tabIds.indexOf(location.hash.slice(1)));
  }

  function unique(a) { return Array.from(new Set(a)); }

  // --- what leads here ------------------------------------------------------
  // The ways into a node that a backward walk may cross: an edge kind that does
  // not carry the flow forward is not one (see EDGE_KINDS), and neither is a
  // self-edge, which arrives where the walk already stands.
  function waysIn(f, id) {
    return (f.incoming[id] || []).filter(function (e) {
      return edgeKind(e.kind).progress !== false && e.from !== id;
    });
  }

  // The shortest route keeps ordinary decision reconvergence legible. Fan-in
  // expands later: every branch into a join, and every branch that comes from a
  // different entry, is also added.
  function shortestRoute(f, nodeId, prefer) {
    function rankOf(e) {
      return prefer[e.from] === undefined ? -1 : prefer[e.from];
    }
    var seen = Object.create(null), via = Object.create(null);
    var queue = [nodeId], far = nodeId, start = null;
    seen[nodeId] = true;
    function claim(e) {
      seen[e.from] = true;
      via[e.from] = e;
      queue.push(e.from);
      far = e.from;
      // The nearest start is where a reader would begin, so it wins over the
      // furthest node, which in a loop is only the long way round.
      if (!start && kindOf((f.nodeById[e.from] || {}).kind) === 'start') start = e.from;
    }

    // The trail is a route, not a preference to apply at each fork. A search by
    // shortest hop would claim a step the reader passed through by whatever
    // short way also reaches it, and the detour they actually walked would drop
    // out of the route between. So the trail is laid down first and whole,
    // latest step first, and the search below only fills in what it left.
    var on = nodeId;
    while (prefer) {
      var next = null;
      waysIn(f, on).forEach(function (e) {
        if (seen[e.from] || rankOf(e) < 0) return;
        if (!next || rankOf(e) > rankOf(next)) next = e;
      });
      if (!next) break;
      claim(next);
      on = next.from;
    }
    // The search picks up where the trail ran out, and nowhere else. Left to
    // start from the selection it would reach back over the steps just laid
    // down and claim their parents by whatever shorter way also arrives, and
    // the route would read past the trail rather than through it.
    if (prefer) queue = [on];

    while (queue.length) {
      var cur = queue.shift();
      var ways = waysIn(f, cur);
      // Off the trail the route falls back to the declared order, latest
      // preference first where a branch was tapped onto rather than walked.
      if (prefer) {
        ways = ways.slice().sort(function (a, b) { return rankOf(b) - rankOf(a); });
      }
      ways.forEach(function (e) { if (!seen[e.from]) claim(e); });
    }

    // via[x] is the edge out of x towards nodeId, so following it always closes
    // the distance and the walk forward cannot circle.
    var edges = Object.create(null), nodes = Object.create(null), at;
    for (at = start || far; ; at = via[at].to) {
      nodes[at] = true;
      if (at === nodeId) break;
      edges[via[at].id] = true;
    }
    return { edges: edges, nodes: nodes };
  }

  function upstream(f, nodeId, prefer) {
    var edges = Object.create(null);
    var pending = [nodeId], examined = Object.create(null);
    var originCache = Object.create(null);
    var fanIn = false;

    // Entries behind a branch say whether a convergence joins separate ways in
    // or merely reunites alternatives from the same decision.
    function origins(id) {
      if (originCache[id]) return originCache[id];
      var found = Object.create(null), seen = Object.create(null), queue = [id];
      while (queue.length) {
        var cur = queue.shift();
        if (seen[cur]) continue;
        seen[cur] = true;
        var incoming = waysIn(f, cur);
        if (kindOf((f.nodeById[cur] || {}).kind) === 'start' || !incoming.length) {
          found[cur] = true;
        } else {
          incoming.forEach(function (e) { queue.push(e.from); });
        }
      }
      return (originCache[id] = Object.keys(found).sort());
    }

    function expand(id) {
      var incoming = waysIn(f, id);
      if (incoming.length < 2) return [];
      if (kindOf((f.nodeById[id] || {}).kind) === 'join') return incoming;
      var sets = incoming.map(function (e) { return origins(e.from); });
      var entries = unique([].concat.apply([], sets));
      var distinct = unique(sets.map(function (s) { return s.join('\u0000'); }));
      return entries.length > 1 && distinct.length > 1 ? incoming : [];
    }

    while (pending.length) {
      var target = pending.shift();
      var route = shortestRoute(f, target, target === nodeId ? prefer : null);
      Object.keys(route.edges).forEach(function (id) { edges[id] = true; });

      Object.keys(route.nodes).forEach(function (id) {
        if (examined[id]) return;
        examined[id] = true;
        var branches = expand(id);
        if (branches.length > 1) fanIn = true;
        branches.forEach(function (e) {
          edges[e.id] = true;
          pending.push(e.from);
        });
      });
    }

    // Distances order the panel from the furthest entry to the selection. A
    // node with several selected ways out has no single branch label.
    var dist = Object.create(null), via = Object.create(null), queue = [nodeId];
    dist[nodeId] = 0;
    while (queue.length) {
      var cur = queue.shift();
      (f.incoming[cur] || []).forEach(function (e) {
        if (!edges[e.id] || dist[e.from] !== undefined) return;
        dist[e.from] = dist[cur] + 1;
        queue.push(e.from);
      });
    }
    Object.keys(dist).forEach(function (id) {
      var ways = (f.outgoing[id] || []).filter(function (e) {
        return edges[e.id] && dist[e.to] !== undefined && dist[e.to] < dist[id];
      });
      if (ways.length === 1) via[id] = ways[0];
    });
    return { edges: edges, dist: dist, via: via, fanIn: fanIn };
  }

  // Whether an edge between two lit nodes is drawn as well. Most are: an added
  // parent hangs off the route instead of floating, a second edge between the
  // same pair lights beside the first, and the loop home lights when both its
  // ends are on show. Not one that jumps forward over a step of the route,
  // though — it arrives where the route already arrives, having missed out what
  // the route went through, and it reads as a second way in. A step hung off
  // the route stands at -1 and is no part of that, or the edge hanging it there
  // would be read as a jump and go dim.
  function alongRoute(dist, e) {
    if (dist[e.from] === undefined || dist[e.to] === undefined) return false;
    return !(dist[e.to] >= 0 && dist[e.from] > dist[e.to] + 1);
  }

  // Furthest hop first, so the list reads start-to-here.
  function stepsInto(lit, minDist) {
    return Object.keys(lit.dist)
      .filter(function (id) { return lit.dist[id] >= minDist; })
      .sort(function (a, b) { return lit.dist[b] - lit.dist[a]; });
  }

  function labelOf(f, id) {
    return (f.nodeById[id] && f.nodeById[id].label) || id;
  }

  // A link between two states is a transition; anywhere else it is an edge.
  // The vocabulary follows the nodes, since a trace has no mode of its own.
  function wordFor(f, e) {
    var a = f.nodeById[e.from], b = f.nodeById[e.to];
    return a && b && a.kind === 'state' && b.kind === 'state' ? 'transition' : 'edge';
  }

  function leadIn(n, fanIn) {
    if (fanIn) return n === 1 ? '1 upstream step' : n + ' upstream steps';
    return n === 1 ? '1 step leads here' : n + ' steps lead here';
  }

  function leadOut(n) {
    return n === 1 ? '1 step follows' : n + ' steps follow';
  }

  // The separators live here, so an absent fact never leaves a stray dot behind.
  function metaRow(parts) {
    var out = [];
    parts.filter(Boolean).forEach(function (part, i) {
      if (i) out.push(h('span', { className: 'sep', key: 'sep' + i }, '\u00b7'));
      out.push(part);
    });
    return h('div', { className: 'meta' }, out);
  }

  // Blank lines separate paragraphs; single newlines stay inside one, held by
  // the pre-wrap on .detail.
  function paragraphs(text, className) {
    return String(text).split(/\n[ \t]*\n/).map(function (part, i) {
      return h('p', { className: className, key: i }, part.trim());
    });
  }

  // Every opener the page can build, since the reader may not use the editor the
  // trace was built on. Each takes the absolute path: a JetBrains IDE registers
  // its own scheme, and the shared jetbrains: one drops any URI for an IDE its
  // daemon did not launch itself.
  var OPENERS = {
    vscode: { label: 'VS Code', url: fileScheme('vscode') },
    cursor: { label: 'Cursor', url: fileScheme('cursor') },
    windsurf: { label: 'Windsurf', url: fileScheme('windsurf') },
    zed: { label: 'Zed', url: fileScheme('zed') },
    sublime: { label: 'Sublime Text', url: urlQuery('subl') },
    textmate: { label: 'TextMate', url: urlQuery('txmt') },
    webstorm: { label: 'WebStorm', url: jetbrainsScheme('webstorm') },
    idea: { label: 'IntelliJ IDEA', url: jetbrainsScheme('idea') },
    copy: { label: 'Copy path:line', url: null }
  };

  // A path may hold a space, a # or an &, each of which ends a URL early or
  // sends the rest of it somewhere else. Encoded per segment, so the
  // separators survive.
  function encodePath(abs) {
    return abs.split('/').map(encodeURIComponent).join('/');
  }

  function fileScheme(scheme) {
    return function (l) { return scheme + '://file' + encodePath(l.abs) + ':' + l.line; };
  }

  function urlQuery(scheme) {
    return function (l) {
      return scheme + '://open?url=file://' + encodePath(l.abs) + '&line=' + l.line;
    };
  }

  function jetbrainsScheme(scheme) {
    return function (l) {
      return scheme + '://open?file=' + encodePath(l.abs) + '&line=' + l.line;
    };
  }

  var EDITOR_KEY = 'flow:editor';
  function readEditor() {
    try {
      var saved = localStorage.getItem(EDITOR_KEY);
      if (saved && OPENERS[saved]) return saved;
    } catch (e) { /* no store */ }
    return OPENERS[doc.editor] ? doc.editor : 'vscode';
  }

  function copyText(text) {
    function fallback() {
      var box = document.createElement('textarea');
      box.value = text; document.body.appendChild(box); box.select();
      try { document.execCommand('copy'); } finally { box.remove(); }
    }
    if (navigator.clipboard) navigator.clipboard.writeText(text).catch(fallback);
    else fallback();
  }

  function CopyRef(props) {
    var state = useState(false), done = state[0], setDone = state[1];
    return h('button', {
      className: props.className, title: 'Copy ' + props.copy,
      onClick: function () {
        copyText(props.copy); setDone(true);
        setTimeout(function () { setDone(false); }, 1200);
      }
    }, done ? 'copied' : props.label);
  }

  // One renderer for every path:line on the page. The chosen opener decides
  // whether that is a link into an editor or something to copy.
  function fileLink(link, label, className, editor) {
    var opener = OPENERS[editor] || OPENERS.vscode;
    if (!opener.url) {
      return h(CopyRef, {
        className: (className ? className + ' ' : '') + 'as-link',
        label: label, copy: link.file
      });
    }
    return h('a', { className: className, href: opener.url(link) }, label);
  }

  // build.py has already settled that a url is http(s) and that an abs is a
  // file inside the source root, so a link with neither is one it warned about:
  // it reads as the path it claimed, without offering to open it.
  function linkList(list, editor) {
    if (!list || !list.length) return null;
    return h(React.Fragment, null,
      h('p', { className: 'trail-label' }, 'References'),
      h('ul', { className: list.length > 1 ? 'links many' : 'links' }, list.map(function (l, i) {
        if (l.abs) {
          return h('li', { key: i },
            fileLink(l, l.label, null, editor),
            l.file !== l.label ? h('span', { className: 'ref' }, l.file) : null
          );
        }
        return h('li', { key: i }, l.url
          ? h('a', { href: l.url, target: '_blank', rel: 'noreferrer' }, l.label)
          : h('span', null, l.label));
      }))
    );
  }

  function tag(color, text) {
    return h('span', { className: 'tag', key: 'tag' },
      h('span', { className: 'dot', style: { background: color } }), text);
  }

  // The key that does what the button does, worn on the button.
  function kbd(k) { return h('kbd', null, k); }

  // The same physical key, named the way this platform names it.
  var ALT = /Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent)
    ? '\u2325' : 'Alt+';

  function panelHead(title, parts) {
    return h('div', { className: 'panel-head' },
      h('h2', null, title),
      metaRow(parts)
    );
  }

  // --- layout ---------------------------------------------------------------
  // dagre owns every coordinate; the flow data carries none.
  // Labels are laid out too, not placed afterwards. An edge that carries one is
  // given its size here, so dagre reserves a slot for it on that edge's own
  // route: no two labels can land on each other, and none lands on a node.
  var LABELH = 20;

  // dagre ends a route where it crosses the node's rectangle, which for a lane
  // far to one side is the node's own corner — the line then reads as leaving
  // the side of the box rather than the face the flow runs off. Both ends are
  // moved onto that face, inset far enough to clear the rounding.
  var INSET = 16;

  // Tracks .node-decision's --point: the hexagon's flat run starts one point in
  // from each end, and the corner before it is not a face at all.
  var POINT = 18;

  // How far along a face a line is allowed to meet it. A rectangle keeps clear
  // of its rounded corners. A hexagon has no face at its corners: laid out
  // top-down its flat run starts a point in, and laid out left to right its side
  // is a single vertex, so every line meets the middle of it.
  function insetOf(kind, across, vertical) {
    if (kindOf(kind) === 'decision') return vertical ? POINT + 8 : across / 2;
    return across / 4 < INSET ? across / 4 : INSET;
  }

  function snapEnds(pts, src, tgt, vertical) {
    var out = pts.slice();
    out[0] = onFace(src, out[1], vertical);
    out[out.length - 1] = onFace(tgt, out[out.length - 2], vertical);
    return out;
  }

  function onFace(node, toward, vertical) {
    // run: the axis the flow travels on, which the point is pinned to the face of,
    // picking the face the flow runs off so a back edge leaves the top. across:
    // the face's own axis, which the point slides along, inset from the corners.
    var run = vertical ? 'y' : 'x', across = vertical ? 'x' : 'y';
    var half = { x: node.width / 2, y: node.height / 2 };
    var inset = Math.min(node.inset, half[across]);
    var p = {};
    p[run] = node[run] + (toward[run] < node[run] ? -1 : 1) * half[run];
    p[across] = clamp(toward[across], node[across] - half[across] + inset,
                                      node[across] + half[across] - inset);
    return p;
  }

  function layout(nodes, edges, dir) {
    // A multigraph, so two edges between the same pair stay two edges — they get
    // their own route and their own label slot instead of sharing one.
    var g = new dagre.graphlib.Graph({ multigraph: true });
    g.setGraph({ rankdir: dir, nodesep: 44, ranksep: 56, marginx: 24, marginy: 24 });
    g.setDefaultEdgeLabel(function () { return {}; });
    var down = dir === 'TB';
    nodes.forEach(function (n) {
      var w = widthOf(n.kind, levelOf(n)), h = heightOf(n);
      g.setNode(n.id, {
        width: w, height: h, inset: insetOf(n.kind, down ? w : h, down)
      });
    });
    // dagre would route a self-edge too, but squared off like any other. It is
    // held back and drawn as an arc instead; see loopPath.
    var routed = edges.filter(function (e) { return e.from !== e.to; });
    routed.forEach(function (e) {
      g.setEdge(e.from, e.to, e.label
        ? { width: labelWidth(e.label), height: LABELH, labelpos: 'c' }
        : {}, e.id);
    });
    dagre.layout(g);

    var routes = Object.create(null), vertical = dir === 'TB', geom = [];
    // Every route is turned into points first: a hop needs to know where the
    // other routes run, so no path can be drawn until they all exist.
    routed.forEach(function (e) {
      var d = g.edge({ v: e.from, w: e.to, name: e.id });
      if (!d) return;
      var ends = snapEnds(d.points, g.node(e.from), g.node(e.to), vertical);
      geom.push({ id: e.id, pts: orthogonal(ends, vertical), label: d });
    });
    var hops = hopsPerEdge(geom, vertical);
    geom.forEach(function (gm) {
      routes[gm.id] = {
        // Kept so an end can be redrawn short of a selected node; see backOff.
        pts: gm.pts, hops: hops[gm.id],
        // Drawn once here, not per render: a route only moves when the layout does.
        path: routePath(gm.pts, hops[gm.id]),
        // dagre puts the label slot on the route, so the line runs under the
        // label and the label's own background masks it.
        label: gm.label.x === undefined ? null : { x: gm.label.x, y: gm.label.y }
      };
    });

    return {
      routes: routes,
      nodes: nodes.map(function (n) {
        // dagre leaves a leaf node's declared size alone, so read it back
        // rather than deriving it twice.
        var p = g.node(n.id), w = p.width, ht = p.height, kind = kindOf(n.kind);
        return {
          id: n.id,
          type: 'flow',
          ariaLabel: (n.label || n.id) + ', ' + kind +
            '. Select to inspect its path and details.',
          position: { x: p.x - w / 2, y: p.y - ht / 2 },
          // Declared, not measured — the minimap draws its rects before layout settles.
          width: w, height: ht,
          data: {
            width: w,
            // Only a bar is pinned to its height; a box grows with a wrapped label.
            height: isBar(n.kind) ? ht : null,
            label: n.label || n.id,
            kind: kind,
            level: levelOf(n),
            note: n.note || '',
            ref: n.ref || '',
            detail: n.detail || '',
            dir: dir
          }
        };
      })
    };
  }

  // --- node -----------------------------------------------------------------
  // A node has room for the file and the line, not the path to it. The full ref
  // is one click away in the panel, which is where a directory is worth reading.
  function refLine(ref) {
    var line = /:\d+$/.exec(ref);
    var name = (line ? ref.slice(0, line.index) : ref).split('/').pop();
    return h('div', { className: 'ref' },
      h('span', { className: 'name', key: 'n' }, name),
      line ? h('span', { className: 'line', key: 'l' }, line[0]) : null);
  }

  function FlowNode(props) {
    var d = props.data;
    var vertical = d.dir === 'TB';
    return h('div', {
      className: 'node node-' + d.kind + (d.level ? ' ' + d.level : '') +
        (d.selected ? ' selected' : '') + (d.dim ? ' dim' : ''),
      style: d.height ? { width: d.width, height: d.height } : { width: d.width }
    },
      h(RF.Handle, {
        id: 'tin', type: 'target',
        position: vertical ? RF.Position.Top : RF.Position.Left,
        style: { opacity: 0 }
      }),
      h('div', { className: 'body' },
        h('div', { className: 'label' }, d.label),
        d.note ? h('div', { className: 'note' }, d.note) : null,
        d.ref ? refLine(d.ref) : null
      ),
      h(RF.Handle, {
        id: 'sout', type: 'source',
        position: vertical ? RF.Position.Bottom : RF.Position.Right,
        style: { opacity: 0 }
      })
    );
  }

  var nodeTypes = { flow: FlowNode };

  // --- self-loop ------------------------------------------------------------
  // dagre can route an edge back to its own node, but squares it off like any
  // other route. A self-transition reads better as an arc, so it is drawn here
  // off the node's own side and kept out of the graph.
  var LOOPGAP = 66;

  function loopPath(props) {
    // bow: the axis the arc swings out on, pushed clear of the node body so the
    // loop does not land its arrowhead on whatever else arrives here. from/to
    // run along the other axis, between the node's two handles.
    var vertical = props.sourcePosition === 'bottom';
    var out = vertical ? props.data.loop.x : props.data.loop.y;
    var bow = (vertical ? props.sourceX : props.sourceY) + LOOPGAP;
    var from = vertical ? props.sourceY : props.sourceX;
    var to = vertical ? props.targetY : props.targetX;
    // Both ends sit on the node's own face, so a selected node's ring covers
    // them the same way it covers a routed edge; see backOff.
    var off = props.data.standoff ? (from > to ? STANDOFF : -STANDOFF) : 0;
    from += off;
    to -= off;
    function at(b, r) { return vertical ? b + ' ' + r : r + ' ' + b; }
    return {
      path: 'M' + at(bow, from) + ' C' + at(bow + out, from + 26) +
            ',' + at(bow + out, to - 26) + ',' + at(bow, to),
      // On the arc's apex, well clear of the node, where the label's own
      // background masks the line behind it.
      label: vertical
        ? { x: bow + out * 0.75, y: (from + to) / 2 }
        : { x: (from + to) / 2, y: bow + out * 0.78 }
    };
  }

  // --- labels ---------------------------------------------------------------
  // A label sits in its own layer above the paths, so it is drawn last whatever
  // order the edges are in, and it stays clickable as the edge it belongs to.
  function edgeLabel(props, d, at) {
    if (!props.label || !at) return null;
    return h(RF.EdgeLabelRenderer, null,
      h('div', {
        className: 'edge-label' + (d.dim ? ' dim' : ''),
        style: { transform: 'translate(-50%, -50%) translate(' + at.x + 'px,' + at.y + 'px)' },
        onClick: d.select
      }, props.label));
  }

  // --- edge ------------------------------------------------------------------
  // A routed path is dagre's own, so it bends around whatever stands between
  // its ends instead of cutting through it. Corners are rounded on the way out.
  var CORNER = 10;

  // dagre hands back a polyline whose hops run diagonally wherever the route
  // shifts lane between ranks. The diagram is orthogonal everywhere else, so
  // each hop is turned into the same step the old router drew — out, across at
  // the halfway line, then on — which also lands every arrowhead square on.
  function orthogonal(pts, vertical) {
    var out = [pts[0]];
    for (var i = 1; i < pts.length; i++) {
      var a = out[out.length - 1], b = pts[i];
      if (a.x !== b.x && a.y !== b.y) {
        var mid = vertical ? (a.y + b.y) / 2 : (a.x + b.x) / 2;
        out.push(vertical ? { x: a.x, y: mid } : { x: mid, y: a.y });
        out.push(vertical ? { x: b.x, y: mid } : { x: mid, y: b.y });
      }
      out.push(b);
    }
    // A point that carries no turn is a corner radius waiting to round nothing.
    return out.filter(function (p, i) {
      var a = out[i - 1], b = out[i + 1];
      if (!a || !b) return true;
      if (p.x === a.x && p.y === a.y) return false;
      return !((a.x === p.x && p.x === b.x) || (a.y === p.y && p.y === b.y));
    });
  }

  // Two lines meeting at a point read as a junction. One of them steps over the
  // other instead, the way a schematic hops a wire it does not join.
  var HOP = 5;

  function at(p, axis, v) {
    return axis === 'x' ? { x: v, y: p.y } : { x: p.x, y: v };
  }

  // One straight run of the path, arcing over any crossing that lands on it far
  // enough from either end to have room for the arc.
  function lineTo(from, to, hops) {
    var horiz = from.y === to.y, axis = horiz ? 'x' : 'y';
    var dir = to[axis] < from[axis] ? -1 : 1, d = '';
    (hops || []).filter(function (p) {
      return (horiz ? p.y === from.y : p.x === from.x) &&
        (p[axis] - from[axis]) * dir > HOP && (to[axis] - p[axis]) * dir > HOP;
    }).sort(function (a, b) {
      return (a[axis] - b[axis]) * dir;
    }).forEach(function (p) {
      var back = at(p, axis, p[axis] - dir * HOP);
      var over = at(p, axis, p[axis] + dir * HOP);
      d += ' L' + back.x + ' ' + back.y +
        ' A' + HOP + ' ' + HOP + ' 0 0 ' + (dir > 0 ? 1 : 0) +
        ' ' + over.x + ' ' + over.y;
    });
    return d + ' L' + to.x + ' ' + to.y;
  }

  function routePath(pts, hops) {
    if (!pts || pts.length < 2) return '';
    var pen = pts[0], d = 'M' + pen.x + ' ' + pen.y;
    for (var i = 1; i < pts.length - 1; i++) {
      var a = pts[i - 1], c = pts[i], b = pts[i + 1];
      var r = Math.min(CORNER, dist(a, c) / 2, dist(c, b) / 2);
      if (r < 1) { d += lineTo(pen, c, hops); pen = c; continue; }
      var s = towards(c, a, r), e = towards(c, b, r);
      d += lineTo(pen, s, hops) + ' Q' + c.x + ' ' + c.y + ',' + e.x + ' ' + e.y;
      pen = e;
    }
    return d + lineTo(pen, pts[pts.length - 1], hops);
  }

  // A crossing belongs to the line running across the flow: the trunks that
  // carry it stay straight, and only the connectors between them hop.
  // ponytail: every across-run against every along-run. O(n^2) on runs, which a
  // diagram small enough to read can afford; index by lane if one never is.
  function hopsPerEdge(geom, vertical) {
    var out = Object.create(null), across = [], along = [];
    geom.forEach(function (gm) {
      out[gm.id] = [];
      for (var i = 1; i < gm.pts.length; i++) {
        var a = gm.pts[i - 1], b = gm.pts[i];
        var withFlow = vertical ? a.x === b.x : a.y === b.y;
        (withFlow ? along : across).push({ id: gm.id, a: a, b: b });
      }
    });
    var run = vertical ? 'x' : 'y', cross = vertical ? 'y' : 'x';
    across.forEach(function (s) {
      var seen = Object.create(null);
      along.forEach(function (t) {
        if (t.id === s.id) return;
        var p = at(s.a, run, t.a[run]);
        // Clear of both ends, so a route that merely turns or arrives here is
        // left alone: a hop is for lines that pass, not lines that meet.
        if (!spans(p[run], s.a[run], s.b[run]) ||
            !spans(p[cross], t.a[cross], t.b[cross])) return;
        // Two edges sharing a lane cross at the same point; one arc is enough.
        if (seen[p[run]]) return;
        seen[p[run]] = true;
        out[s.id].push(p);
      });
    });
    return out;
  }

  function spans(v, a, b) {
    return v > Math.min(a, b) + HOP && v < Math.max(a, b) - HOP;
  }

  function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }

  function dist(a, b) { return Math.hypot(b.x - a.x, b.y - a.y); }

  function towards(from, to, by) {
    var len = dist(from, to) || 1;
    return { x: from.x + (to.x - from.x) * by / len, y: from.y + (to.y - from.y) * by / len };
  }

  // A selected node wears a ring 4px off its face, and a line drawn to the face
  // runs under it — an arrowhead lands inside the ring. So the ends that meet
  // the selection, and only those, stop short of it. Every other line stays
  // attached. A selected edge keeps the same final run without moving its end.
  var STANDOFF = 7, ARROW_RUN = 14;

  function backOff(route, atSource, atTarget, selectedEdge) {
    if (!route || !route.pts) return route;
    // Most edges touch nothing selected, so redrawing their path would hand
    // back the same string off a fresh object and cost them their identity.
    if (!atSource && !atTarget && !selectedEdge) return route;
    var pts = route.pts.slice(), last = pts.length - 1;
    // Each end's neighbour lies out in the gap between the ranks, so a step
    // towards it is a step off the face.
    if (atSource) pts[0] = towards(pts[0], pts[1], STANDOFF);
    if (atTarget) pts[last] = towards(pts[last], pts[last - 1], STANDOFF);
    // Keep enough straight line after the last bend for the arrowhead. Move the
    // whole cross-run so the route stays orthogonal.
    if ((atTarget || selectedEdge) && last > 2) {
      var end = pts[last], turn = pts[last - 1], lane = pts[last - 2];
      var axis = turn.x === end.x ? 'y' : 'x';
      var run = Math.abs(end[axis] - turn[axis]);
      var extra = Math.max(0, CORNER + ARROW_RUN - run);
      var shift = (end[axis] > turn[axis] ? -1 : 1) * extra;
      pts[last - 1] = Object.assign({}, turn);
      pts[last - 2] = Object.assign({}, lane);
      pts[last - 1][axis] += shift;
      pts[last - 2][axis] += shift;
    }
    return Object.assign({}, route, { path: routePath(pts, route.hops) });
  }

  function FlowEdge(props) {
    var d = props.data || {};
    // A routed edge carries the geometry dagre laid out; a self-loop, which is
    // kept out of the graph, draws its own. Same shape either way.
    var geo = d.route || loopPath(props);
    return h(React.Fragment, null,
      h(RF.BaseEdge, {
        id: props.id, path: geo.path, style: props.style, markerEnd: props.markerEnd
      }),
      edgeLabel(props, d, geo.label));
  }

  var edgeTypes = { flow: FlowEdge };

  // Every header popover dismisses the same way: click away or press Escape.
  function useDismiss(open, setOpen, ref) {
    useEffect(function () {
      if (!open) return;
      // The check badge leaves with a switch to a clean tab, and takes its
      // popover with it, so the box can be gone while the flag is still up.
      function close(ev) {
        if (ev.type === 'keydown' && ev.key !== 'Escape') return;
        var box = ref.current;
        if (ev.type === 'mousedown' && box && box.contains(ev.target)) return;
        setOpen(false);
        if (ev.type === 'keydown' && box) box.querySelector('button').focus();
      }
      addEventListener('mousedown', close); addEventListener('keydown', close);
      return function () {
        removeEventListener('mousedown', close); removeEventListener('keydown', close);
      };
    }, [open]);
  }

  // --- app ------------------------------------------------------------------
  function App() {
    var tabState = useState(tabFromHash), tab = tabState[0], setTab = tabState[1];
    var dirState = useState('TB'), dir = dirState[0], setDir = dirState[1];
    var selState = useState(null), sel = selState[0], setSel = selState[1];
    var mapState = useState(function () { return readToggle(MAP_KEY); });
    var showMap = mapState[0], setShowMap = mapState[1];
    var exportState = useState(false), showExport = exportState[0], setShowExport = exportState[1];
    var menuState = useState(false), showMenu = menuState[0], setShowMenu = menuState[1];
    var noteState = useState(false), showNote = noteState[0], setShowNote = noteState[1];
    var introState = useState(false), showIntro = introState[0], setShowIntro = introState[1];
    var bgState = useState(true), exportBg = bgState[0], setExportBg = bgState[1];
    var editorState = useState(readEditor), editor = editorState[0], setEditor = editorState[1];
    var themeState = useState(function () {
      return matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
    });
    var canvasTheme = themeState[0], setCanvasTheme = themeState[1];
    var exportRef = useRef(null), menuRef = useRef(null), checkRef = useRef(null);
    var walk = useRef({ at: null, trail: [] });
    var f = flows[tab];
    var entryIds = useMemo(function () {
      var entries = f.nodeList.filter(function (n) { return kindOf(n.kind) === 'start'; });
      if (!entries.length) entries = f.nodeList.filter(function (n) { return !f.incoming[n.id]; });
      return entries.map(function (n) { return n.id; });
    }, [f]);
    var startId = entryIds[0] || (f.nodeList[0] || {}).id;

    useEffect(function () {
      function syncTab() {
        setTab(tabFromHash());
        setSel(null);
        // The badge belongs to the tab that failed, so its popover leaves with
        // it rather than reappearing on the way back.
        setShowNote(false);
      }
      addEventListener('hashchange', syncTab);
      return function () { removeEventListener('hashchange', syncTab); };
    }, []);

    useDismiss(showExport, setShowExport, exportRef);
    useDismiss(showMenu, setShowMenu, menuRef);
    useDismiss(showNote, setShowNote, checkRef);

    var laidOut = useMemo(function () { return layout(f.nodeList, f.edgeItems, dir); }, [f, dir]);
    var placedNodes = laidOut.nodes, routes = laidOut.routes;
    // The highlight, the fit and the keyboard walk all want a node by id, and
    // only the layout knows where it stands, so they share one index.
    var placed = useMemo(function () {
      return placedNodes.reduce(function (m, n) {
        m[n.id] = n;
        return m;
      }, Object.create(null));
    }, [placedNodes]);

    // The steps the reader actually walked, in order. A reader who came down one
    // branch expects the trail back to stay on it for the rest of the walk, not
    // just for the next step, so this keeps the whole route rather than the last
    // node. Read during render, so it still names where they stood; the guard
    // makes a repeat render of the same selection a no-op.
    var here = sel && sel.kind === 'node' ? sel.id : null;
    if (here !== walk.current.at) {
      var was = walk.current.at, path = walk.current.trail;
      var backTo = here === null ? -1 : path.indexOf(here);
      walk.current = {
        at: here,
        // Stepping back onto the trail shortens it; stepping on from where they
        // stood extends it; landing anywhere else starts a new one.
        trail: here === null ? []
          : backTo !== -1 ? path.slice(0, backTo + 1)
          : (f.incoming[here] || []).some(function (e) { return e.from === was; })
            ? path.concat([here])
            : [here]
      };
    }
    // A trail only counts where it really arrives here, so it can never light
    // something that does not lead to the selection.
    var onTrail = !!here && walk.current.trail.length > 1 &&
      (f.incoming[here] || []).some(function (e) {
        return walk.current.trail.indexOf(e.from) !== -1;
      });
    // A stable dep: the memo rebuilds the ranks only when the trail moves.
    var trailKey = onTrail ? walk.current.trail.join('\u0000') : '';

    // Which way the route back goes wherever it has a choice: the walked trail
    // first, then any branch the reader tapped their way onto, which outranks
    // the trail because it is the later word on the same question.
    function ranking(trail, via) {
      var rank = Object.create(null);
      trail.forEach(function (nid, i) { rank[nid] = i; });
      via.forEach(function (nid, i) { rank[nid] = trail.length + i; });
      return rank;
    }
    function preferring(via) {
      if (!trailKey && !via.length) return null;
      return ranking(trailKey ? walk.current.trail : [], via);
    }

    // Selecting anything asks the same question: what leads here?
    var lit = useMemo(function () {
      if (!sel) return null;
      // How far down the flow a node stands: the axis the layout runs on.
      var along = dir === 'TB' ? 'y' : 'x';
      var prefer = preferring(sel.via || []);
      var id = sel.kind === 'node' ? sel.id : f.edgeById[sel.id].from;
      var up = upstream(f, id, prefer);

      // A selected node has a shape: the route is one way in and it may have
      // others, which light too, or a step with two parents looks as though it
      // had one. Only the ones the layout draws arriving, though — an edge from
      // a node placed further down is the loop coming back, and lighting that
      // reads as the selection pointing at something. Lit at -1, so they stay
      // out of the trail, which is still a single path.
      //
      // A selected edge has no such shape. It asks what leads to this one edge,
      // so the other ways into the node it leaves are no part of the answer.
      if (sel.kind === 'node' && !trailKey) {
        (f.incoming[id] || []).forEach(function (e) {
          if (placed[e.from].position[along] < placed[e.to].position[along] &&
              up.dist[e.from] === undefined) up.dist[e.from] = -1;
        });
      }
      // Then the edges between two lit nodes, in either direction. Which nodes
      // light is already settled above, so this only draws what runs between
      // them; see alongRoute for which of those count. A dim node keeps its
      // edges dim, which is what holds the loop back in the first place.
      f.edgeItems.forEach(function (e) {
        if (alongRoute(up.dist, e)) up.edges[e.id] = true;
      });

      if (sel.kind === 'edge') {
        var e = f.edgeById[sel.id];
        up.edges[e.id] = true;
        up.via[e.from] = e;
        // Lit, but not a step that leads here: it is where this edge arrives.
        if (up.dist[e.to] === undefined) up.dist[e.to] = -1;
      }
      return up;
    }, [f, sel, placed, dir, trailKey]);

    var nodes = useMemo(function () {
      return placedNodes.map(function (n) {
        return Object.assign({}, n, {
          data: Object.assign({}, n.data, {
            selected: !!sel && sel.kind === 'node' && sel.id === n.id,
            dim: !!lit && lit.dist[n.id] === undefined
          })
        });
      });
    }, [placedNodes, sel, lit]);

    // Relayout moves every node, so the old viewport frames nothing, and so does
    // a canvas that changed size: a phone rotating, or the panel taking its turn.
    var rf = RF.useReactFlow();
    var paneW = RF.useStore(function (s) { return s.width; });
    var paneH = RF.useStore(function (s) { return s.height; });
    function fitReadable(whole, animate) {
      var duration = animate && !matchMedia('(prefers-reduced-motion: reduce)').matches ? 300 : 0;
      // Turning the layout is the question of whether the flow reads better the
      // other way round, so that fit answers with all of it, however small it
      // lands. Every other fit keeps the floor.
      if (whole) { rf.fitView({ padding: FIT.padding, duration: duration }); return; }
      var focusId = sel && sel.kind === 'node' ? sel.id :
        sel && f.edgeById[sel.id] ? f.edgeById[sel.id].from : startId;
      var focus = placed[focusId];
      Promise.resolve(rf.fitView(Object.assign({}, FIT, { duration: duration }))).then(function () {
        if (!focus || rf.getZoom() > FIT.minZoom + 0.001) return;
        var box = rf.getNodesBounds(placedNodes);
        rf.setCenter(
          held(focus.position.x + focus.width / 2, box.x, box.x + box.width, paneW),
          held(focus.position.y + focus.height / 2, box.y, box.y + box.height, paneH),
          { zoom: FIT.minZoom, duration: duration }
        );
      });
    }
    var lastDir = useRef(dir);
    useEffect(function () {
      var turned = lastDir.current !== dir;
      lastDir.current = dir;
      fitReadable(turned);
    }, [f, dir, rf, paneW, paneH, placedNodes, startId]);

    var selectEdge = useCallback(function (id) {
      setSel({ kind: 'edge', id: id });
    }, []);

    // Everything about an edge that a selection cannot change. Clicking rebuilds
    // only the layer below, so the geometry, the aria text and the label
    // handlers are built once per layout instead of once per click.
    var baseEdges = useMemo(function () {
      return f.edgeItems.map(function (e) {
        var kind = edgeKind(e.kind), route = routes[e.id];
        return {
          id: e.id, source: e.from, target: e.to, label: e.label || undefined,
          ariaLabel: (e.kind ? kind.label + ' ' : '') +
            (e.label ? e.label + ': ' : '') + labelOf(f, e.from) +
            ' to ' + labelOf(f, e.to) + '. Select to inspect this ' + wordFor(f, e) + '.',
          sourceHandle: 'sout', targetHandle: 'tin',
          type: 'flow',
          // A kind's colour is information and always shows; the accent is
          // state, so it only paints where the kind has nothing to say. With
          // nothing selected there is no state, so every edge sits at rest.
          color: kind.color,
          data: {
            route: route || null,
            loop: route ? null : {
              x: widthOf(f.nodeById[e.from].kind, levelOf(f.nodeById[e.from])) / 2 + 70,
              y: heightOf(f.nodeById[e.from]) / 2 + 60
            },
            dim: false,
            // The label is outside the edge's own group, so React Flow's edge
            // click never reaches it; it selects the edge itself.
            select: function () { selectEdge(e.id); }
          },
          style: {
            stroke: kind.color || MUTED, strokeWidth: 1.5, strokeDasharray: kind.dash
          },
          // The marker id is built from every field here, so an undefined colour
          // yields a marker that paints nothing. Always name it.
          markerEnd: {
            type: RF.MarkerType.ArrowClosed, color: kind.color || MUTED
          }
        };
      });
    }, [f, routes, selectEdge]);

    // With nothing selected there is no state to paint, so the array built above
    // is handed straight through and every edge keeps its identity.
    var edges = useMemo(function () {
      if (!lit) return baseEdges;
      return baseEdges.map(function (b) {
        var on = !!lit.edges[b.id];
        // A node wears a ring when it is the selection; an edge had nothing, so
        // the one that was clicked looked no different from the route drawn to
        // reach it. Weight says which is which.
        var picked = sel.kind === 'edge' && sel.id === b.id;
        var stroke = b.color || (on ? ACCENT : MUTED);
        var onNode = sel.kind === 'node';
        var fromSel = onNode && sel.id === b.source;
        return Object.assign({}, b, {
          data: Object.assign({}, b.data, {
            dim: !on,
            route: backOff(b.data.route, fromSel,
                           onNode && sel.id === b.target, picked),
            standoff: fromSel
          }),
          className: on ? undefined : 'dim',
          style: Object.assign({}, b.style, {
            stroke: stroke, strokeWidth: picked ? 3.5 : (on ? 2 : 1.5)
          }),
          markerEnd: { type: RF.MarkerType.ArrowClosed, color: stroke }
        });
      });
    }, [baseEdges, lit, sel]);

    var onNodeClick = useCallback(function (_, node) {
      // Where a branch was taken on the way here, the one not taken is dim but
      // still leads to the selection. Tapping it moves the route across without
      // leaving the selection, so the reader can amend a choice made for them;
      // once it is lit, the next tap selects it like any other node.
      if (sel && lit && lit.dist[node.id] === undefined) {
        var via = (sel.via || []).concat([node.id]);
        var from = sel.kind === 'node' ? sel.id : f.edgeById[sel.id].from;
        if (upstream(f, from, preferring(via)).dist[node.id] !== undefined) {
          setSel(Object.assign({}, sel, { via: via }));
          return;
        }
      }
      setSel({ kind: 'node', id: node.id });
    }, [f, sel, lit, trailKey]);
    var onEdgeClick = useCallback(function (_, edge) {
      selectEdge(edge.id);
    }, [selectEdge]);

    // Both toggles are reachable from the header and from a key, and neither
    // reading may drift from the other. The button carries its key, so the
    // shortcut is discoverable without a legend of its own.
    function toggleMap() { writeToggle(MAP_KEY, !showMap); setShowMap(!showMap); }
    function toggleDir() { setDir(dir === 'TB' ? 'LR' : 'TB'); }

    // Down walks the flow forward, up walks it back, and left/right cross the
    // other ways out of the step above, or where there are none, the other ways
    // into the step itself. Down reads the graph as it stands, so
    // down after up lands on the first way on, not the branch it came up from;
    // left and right are how a reader crosses back to it. Up is the one that
    // follows the route already lit, since that route is what the diagram and
    // the panel both say leads here.
    useEffect(function () {
      // The sideways axis is whichever one the layout is not running down, so
      // the order left/right moves in is the order the eye reads.
      var axis = dir === 'TB' ? 'x' : 'y';
      function byAxis(a, b) {
        return placed[a].position[axis] - placed[b].position[axis];
      }

      // A self-edge is not a way on: it arrives where the walk already stands.
      function ways(id, back) {
        var edges = (back ? f.incoming[id] : f.outgoing[id]) || [];
        return unique(edges.map(function (e) { return back ? e.from : e.to; }))
          .filter(function (other) { return other !== id; })
          .sort(byAxis);
      }

      // The way in that is lit: the branch a reader came down, tapped onto, or
      // the declared first where they did neither. A join has several, so the
      // step actually walked from wins over the rest.
      function cameFrom(id, open) {
        if (!lit) return null;
        var on = open.filter(function (p) {
          return lit.via[p] && lit.via[p].to === id;
        });
        var trail = walk.current.trail, was = trail[trail.length - 2];
        return on.indexOf(was) !== -1 ? was : on[0] || null;
      }

      // Focus follows the walk. React Flow makes every node focusable, so a ring
      // left behind on the step they came from reads as a second selection, and
      // a reader who tabs in and then walks would tab back to where they began.
      function focusNode(id) {
        var el = document.querySelector(
          '.react-flow__node[data-id="' + CSS.escape(id) + '"]');
        // The pan below is the one that decides what is on screen.
        if (el) el.focus({ preventScroll: true });
      }

      // A step walked to off-screen leaves the panel describing something the
      // reader cannot see. Pan to it when it is outside, and hold the zoom, so
      // the walk never rescales the diagram underneath them.
      function reveal(id) {
        var n = placed[id], pane = document.querySelector('.react-flow');
        if (!n || !pane) return;
        var box = pane.getBoundingClientRect();
        var a = rf.flowToScreenPosition(n.position);
        var b = rf.flowToScreenPosition({
          x: n.position.x + n.width, y: n.position.y + n.height
        });
        var m = 24;
        if (a.x >= box.left + m && b.x <= box.right - m &&
            a.y >= box.top + m && b.y <= box.bottom - m) return;
        rf.setCenter(n.position.x + n.width / 2, n.position.y + n.height / 2, {
          zoom: rf.getZoom(), duration: 300
        });
      }

      function onKey(ev) {
        // Alt with a digit opens that tab. The modifier rewrites ev.key into a
        // symbol on a Mac, so it is the physical key that is read.
        if (ev.altKey && !ev.metaKey && !ev.ctrlKey && tabIds.length > 1) {
          var digit = /^Digit([1-9])$/.exec(ev.code);
          if (digit && +digit[1] <= tabIds.length) {
            ev.preventDefault();
            openTab(+digit[1] - 1);
            return;
          }
        }
        if (ev.metaKey || ev.ctrlKey || ev.altKey || ev.shiftKey) return;
        var t = ev.target;
        if (t && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName))) return;
        // The two view toggles answer to a key as well, so a reader walking the
        // diagram never has to go back to the header for them.
        if (ev.key === 'm') { ev.preventDefault(); toggleMap(); return; }
        if (ev.key === 'l') { ev.preventDefault(); toggleDir(); return; }

        var down = ev.key === 'ArrowDown', up = ev.key === 'ArrowUp';
        var right = ev.key === 'ArrowRight', left = ev.key === 'ArrowLeft';
        if (!down && !up && !right && !left) return;

        var pick = null;
        var here = sel && sel.kind === 'node' ? sel.id : null;

        if (down || up) {
          // An edge is already a move between two nodes, so it walks to its own
          // ends rather than looking for further ones.
          if (!sel) {
            if (down) pick = startId;
          } else if (sel.kind === 'edge') {
            pick = up ? f.edgeById[sel.id].from : f.edgeById[sel.id].to;
          } else {
            var open = ways(here, up);
            // Nothing above the first step: pressing up there steps off the
            // walk entirely and puts every node back in view.
            if (up && !open.length) {
              ev.preventDefault();
              setSel(null);
              return;
            }
            pick = (up && cameFrom(here, open)) || open[0];
          }
        } else if (here !== null) {
          // Siblings are the other ways out of whatever leads here. Entries have
          // no shared parent, so they form their own row.
          var entry = entryIds.indexOf(here) !== -1;
          var back = entry ? null : ways(here, true)[0];
          var row = entry ? entryIds.slice().sort(byAxis)
            : (back ? ways(back, false) : []);
          var at = row.indexOf(here);
          if (at !== -1 && row.length > 1) {
            pick = row[(at + (right ? 1 : row.length - 1)) % row.length];
          }
          // No row to cross means the step is the only way on from what leads
          // here, and the key would do nothing. Where several ways in meet, it
          // has something better to do: cross those instead, moving the route
          // over to the next of them without leaving the step.
          var ins = ways(here, true);
          var was = pick ? null : cameFrom(here, ins);
          var from = ins.indexOf(was);
          if (from !== -1 && ins.length > 1) {
            var across = ins[(from + (right ? 1 : ins.length - 1)) % ins.length];
            // Crossing restates how the reader got here, so it restates the
            // trail: what still leads to the branch they crossed to is kept,
            // and the rest gives way to the branch itself. Written into the
            // trail rather than laid over it, or walking on would take the way
            // in the trail still named and the crossing would not survive the
            // next step.
            var keep = walk.current.trail.slice(0, -1);
            while (keep.length && !(f.outgoing[keep[keep.length - 1]] || [])
                .some(function (e) { return e.to === across; })) keep.pop();
            var next = keep.concat([across, here]);
            // Not every way in can be routed through: one that only reaches the
            // step by the way already taken would leave the route as it stands.
            if (upstream(f, here, ranking(next, [])).dist[across] !== undefined) {
              ev.preventDefault();
              walk.current = { at: here, trail: next };
              setSel({ kind: 'node', id: here });
              return;
            }
          }
        }
        if (!pick) return;

        // Only once a key has somewhere to go, so an arrow the walk cannot use
        // still scrolls the page.
        ev.preventDefault();
        setSel({ kind: 'node', id: pick });
        focusNode(pick);
        reveal(pick);
      }

      addEventListener('keydown', onKey);
      return function () { removeEventListener('keydown', onKey); };
    }, [f, sel, lit, placed, dir, entryIds, startId, rf, showMap]);

    // The hash is what says which tab is open; the hashchange listener above
    // clears the selection, and the relayout effect refits the new graph.
    function openTab(i) { location.hash = tabIds[i]; }

    function runExport(format) {
      setShowExport(false);
      setShowMenu(false);
      // svgExport throws synchronously when the canvas is missing, so the call
      // goes through a promise to keep both failures on one handler.
      Promise.resolve().then(function () {
        return exportFlow(nodes, f.title || doc.title || 'Flow', format, exportBg);
      }).catch(function (error) {
        console.error(error); alert('Could not export this flow.');
      });
    }

    // Which way this step went on the one route traced into the selection.
    function branchOut(id) {
      return lit.via[id] && lit.via[id].label || '';
    }

    // One row of a list: the step itself, and the file it lives in.
    function stepRow(id, key, branch) {
      var n = f.nodeById[id] || {};
      function open() { setSel({ kind: 'node', id: id }); }
      return h('li', { key: key },
        h('button', { className: 'open', onClick: open },
          labelOf(f, id),
          branch ? h('span', { className: 'branch' }, '\u2192 ' + branch) : null
        ),
        n.refLink
          ? fileLink(n.refLink, n.ref, 'ref', editor)
          : (n.ref ? h('span', { className: 'ref' }, n.ref) : null)
      );
    }

    // The panel's slice of the diagram, in the order the flow runs: the steps
    // that led here start-first, this step, then every way on. The middle line
    // repeats the title on purpose — it is what both lists are relative to, and
    // it is where the arrow keys are standing.
    function slice(here, minDist, outs) {
      var ids = stepsInto(lit, minDist);
      return h('nav', { className: 'slice' },
        ids.length
          ? h(React.Fragment, null,
              h('div', { className: 'trail-label' }, leadIn(ids.length, lit.fanIn)),
              h(lit.fanIn ? 'ul' : 'ol', {
                className: 'steps' + (lit.fanIn ? ' fan-in' : '')
              }, ids.map(function (id) {
                return stepRow(id, id, branchOut(id));
              })))
          : h('p', { className: 'hint' }, 'Nothing leads here. This is a starting point.'),
        h('div', { className: 'here' }, here),
        // Unlike the trail, this is every branch, not the one the highlight
        // took, so a decision names both ways out.
        outs.length
          ? h(React.Fragment, null,
              h('div', { className: 'trail-label out' }, leadOut(outs.length)),
              h('ul', { className: 'nexts' }, outs.map(function (e) {
                return stepRow(e.to, e.id, e.label);
              })))
          : h('p', { className: 'hint out' }, 'Nothing follows. This is an end point.')
      );
    }

    // The ways into the flow, so the welcome screen is itself a way in rather
    // than an instruction to go and find one. Declared starts if there are any,
    // else whatever nothing leads into.
    function starts() {
      if (!entryIds.length) return null;
      return h('nav', { className: 'slice' },
        h('div', { className: 'trail-label' },
          entryIds.length === 1 ? 'Starts here' : entryIds.length + ' ways in'),
        h('ul', { className: 'nexts' }, entryIds.map(function (id) {
          return stepRow(id, id, null);
        }))
      );
    }

    // Every state of the panel takes the same shape: a title that names the
    // subject, one meta line of secondary facts, then the body it earns.
    function panel() {
      if (sel && sel.kind === 'node') {
        var n = f.nodeById[sel.id];
        var kind = kindOf(n.kind);
        return h(React.Fragment, null,
          panelHead(n.label || n.id, [
            tag(KIND_COLOR[kind], kind),
            n.ref
              ? h('code', { key: 'ref' },
                  // Only a ref with a file behind it opens; the rest is still
                  // worth showing.
                  n.refLink ? fileLink(n.refLink, n.ref, null, editor) : n.ref)
              : null
          ]),
          h('div', { className: 'panel-body' },
            n.note ? h('p', { className: 'note' }, n.note) : null,
            paragraphs(n.detail || 'No detail recorded for this step.', 'detail'),
            linkList(n.links, editor),
            slice(n.label || n.id, 1, f.outgoing[sel.id] || [])
          )
        );
      }
      if (sel) {
        var e = f.edgeById[sel.id];
        // An unlabelled edge has no name of its own, so the transition becomes
        // the title rather than the word "unlabelled".
        var move = labelOf(f, e.from) + ' → ' + labelOf(f, e.to);
        return h(React.Fragment, null,
          panelHead(e.label || move, [
            tag(edgeKind(e.kind).color || MUTED, e.kind || wordFor(f, e)),
            e.label ? h('span', { key: 'ends' }, move) : null
          ]),
          h('div', { className: 'panel-body' },
            e.detail
              ? paragraphs(e.detail, 'detail')
              : h('p', { className: 'hint' },
                  'No detail recorded for this ' + wordFor(f, e) + '.'),
            linkList(e.links, editor),
            // An edge's own slice: what led into it, the move itself, and the
            // step it lands on.
            slice(e.label || move, 0, [e])
          )
        );
      }
      // Nothing selected: the diagram introduces itself. This is where the title
      // and the summary live, so the header is free to carry the tabs.
      return h(React.Fragment, null,
        panelHead(f.title || doc.title || 'Flow', [
          doc.title && doc.title !== f.title
            ? h('span', { key: 'doc' }, doc.title) : null,
          h('span', { key: 'n' }, f.nodeList.length + ' nodes'),
          h('span', { key: 'e' }, f.edgeItems.length + ' edges')
        ]),
        h('div', { className: 'panel-body' },
          f.summary ? paragraphs(f.summary, 'detail') : null,
          linkList(f.links, editor),
          starts(),
          h('p', { className: 'hint' },
            'Select a node or an edge to see what leads there. Tapping a dim ' +
            'branch that could have led there moves the route across it; tap ' +
            'again to select it. ',
            // No keyboard on the screen that hides these controls anyway.
            h('span', { className: 'keys-only' },
              'Or walk the flow with the arrow keys: down and up along it, left ' +
              'and right across a branch, or across the ways in where there is ' +
              'no branch. M shows the minimap, L turns the layout' +
              (flows.length > 1 ? ', ' + ALT + '1 and up open a tab' : '') + '. '),
            'Two fingers pan and pinch zooms. Double-click blank space to refit.'),
          f.problems.length
            ? h('ul', { className: 'problems' }, f.problems.map(function (t, i) {
                return h('li', { key: i }, t);
              }))
            // A passing check is worth saying once, where the diagram introduces
            // itself, rather than wearing a badge in the header all session.
            : h('p', { className: 'verdict' },
                h('span', { className: 'mark' }, '\u2713'), checkText)
        )
      );
    }

    // Each control is built once and rendered twice: inline on a wide header,
    // and inside the ☰ menu on a narrow one. Only one set is ever visible.
    var dirButton = h('button', {
      key: 'dir', autoFocus: showMenu,
      onClick: function () { toggleDir(); setShowMenu(false); }
    }, (dir === 'TB' ? 'Left to right' : 'Top to bottom'), kbd('L'));
    var minimapButton = h('button', {
      key: 'map', className: 'minimap-toggle',
      onClick: toggleMap
    }, (showMap ? 'Hide minimap' : 'Show minimap'), kbd('M'));
    // Only worth asking where files should open when there are files.
    var openerSelect = doc.hasFileLinks ? h('select', {
      key: 'opener', className: 'opener', value: editor, 'aria-label': 'Open files in',
      onChange: function (ev) {
        setEditor(ev.target.value);
        try { localStorage.setItem(EDITOR_KEY, ev.target.value); } catch (e) { /* no store */ }
      }
      // The closed control shows a bare editor name; the group heading is what
      // says what picking one does, and it costs no room in the header.
    }, h('optgroup', { label: 'Open files in' }, Object.keys(OPENERS).map(function (key) {
      return h('option', { key: key, value: key }, OPENERS[key].label);
    }))) : null;
    var exportItems = [
      h('button', {
        key: 'svg', autoFocus: showExport,
        onClick: function () { runExport('svg'); }
      }, 'Export as SVG'),
      h('button', { key: 'png', onClick: function () { runExport('png'); } }, 'Export as PNG'),
      h('label', { key: 'bg' },
        h('input', {
          type: 'checkbox', checked: exportBg,
          onChange: function (ev) { setExportBg(ev.target.checked); }
        }),
        'Background')
    ];
    // Only a failing check reaches the badge, so this always counts problems.
    var checkLabel = f.problems.length +
      ' problem' + (f.problems.length > 1 ? 's' : '');
    var checkText = f.problems.length
      ? f.problems.join('\n')
      : 'Structure valid: ' + f.nodeList.length + ' nodes checked at build time. IDs ' +
        'unique, kinds known, every edge resolves, every decision branches, ' +
        'every path reaches an end.';

    return h(React.Fragment, null,
      h('header', null,
        h('div', { className: 'tabs', 'aria-label': flows.length > 1 ? 'Flows' : null },
          flows.length > 1
          ? [h('h1', { className: 'flow-title sr-only', key: 'title' }, doc.title || 'Flow')]
              .concat(flows.map(function (fl, i) {
              return h('button', {
                key: i,
                className: 'tab' + (i === tab ? ' on' : ''),
                'aria-current': i === tab ? 'page' : null,
                onClick: function () { openTab(i); }
              }, (fl.title || 'Flow ' + (i + 1)),
                // Past nine there is no digit left to press.
                i < 9 ? kbd(ALT + (i + 1)) : null);
            }))
          : h('h1', { className: 'flow-title' }, f.title || doc.title || 'Flow')),
        h('div', { className: 'controls' },
          dirButton, minimapButton, openerSelect,
          h('div', { className: 'export', ref: exportRef },
            h('button', {
              'aria-expanded': showExport, 'aria-controls': 'export-options',
              onClick: function () { setShowExport(!showExport); }
            }, 'Export ↓'),
            showExport
              ? h('div', {
                  id: 'export-options', className: 'export-menu', role: 'group',
                  'aria-label': 'Export options'
                }, exportItems)
              : null
          )
        ),
        // Narrow screens keep the check in view and fold everything else away.
        h('div', { className: 'burger-wrap', ref: menuRef },
          h('button', {
            className: 'burger', 'aria-label': 'Menu',
            'aria-expanded': showMenu, 'aria-controls': 'flow-options',
            onClick: function () { setShowMenu(!showMenu); }
          }, '☰'),
          showMenu
            ? h('div', {
                id: 'flow-options', className: 'export-menu', role: 'group',
                'aria-label': 'Flow options'
              },
                dirButton, openerSelect, exportItems)
            : null
        ),
        // Only a broken trace is loud enough to sit in the header; the passing
        // one is a line in the panel.
        f.problems.length
          ? h('div', { className: 'check', ref: checkRef },
              h('button', {
                className: 'badge bad',
                title: checkText, 'aria-label': checkLabel, 'aria-expanded': showNote,
                onClick: function () { setShowNote(!showNote); }
              },
                h('span', { className: 'mark' }, '\u26a0'),
                h('span', { className: 'label' }, checkLabel)),
              showNote ? h('div', { className: 'check-note' }, checkText) : null
            )
          : null
      ),
      // On a narrow screen the canvas and the panel take turns, and the panel's
      // turn comes from a selection or from the intro button on the canvas.
      h('main', { className: sel || showIntro ? 'panel-open' : '' },
        h('div', {
          className: 'canvas canvas-' + canvasTheme,
          onDoubleClickCapture: function (ev) {
            if (ev.target.classList.contains('react-flow__pane')) fitReadable(false, true);
          }
        },
          h(RF.ReactFlow, {
            nodes: nodes, edges: edges, nodeTypes: nodeTypes, edgeTypes: edgeTypes,
            nodesDraggable: false,
            // The walk pans for itself, and it animates; React Flow's own pan
            // on focus would jump there first and leave nothing to animate.
            autoPanOnNodeFocus: false,
            onNodeClick: onNodeClick, onEdgeClick: onEdgeClick,
            onPaneClick: function () { setSel(null); },
            fitView: true, fitViewOptions: FIT,
            // Two fingers pan and pinch zooms, the trackpad gestures a canvas
            // is expected to answer. Pinch arrives as ctrl + wheel, which React
            // Flow keeps for zoom once the plain wheel is spent on panning.
            // Shift is its box-select key and box-select does nothing here.
            panOnScroll: true, zoomOnDoubleClick: false, selectionKeyCode: null,
            proOptions: { hideAttribution: true },
            minZoom: 0.1
          },
            h(RF.Controls, { showInteractive: false }),
            showMap ? h(RF.MiniMap, {
              pannable: true, zoomable: true, nodeColor: nodeColorOf
            }) : null,
            // Only a narrow screen hides the panel, so only a narrow screen
            // has anything to open; the CSS decides, and the panel keeps no
            // hit area on a wide one.
            h(RF.Panel, { position: 'top-left', className: 'canvas-intro' },
              h('button', {
                className: 'mobile-back',
                onClick: function () { setShowIntro(true); }
              }, 'About this flow')),
            h(RF.Panel, { position: 'top-right', className: 'canvas-tools' },
              h('div', {
                className: 'edge-legend', role: 'list', 'aria-label': 'Edge legend'
              }, unique(f.edgeItems.map(function (e) {
                return e.kind && EDGE_KINDS[e.kind] ? e.kind : '';
              })).map(function (key) {
                var item = EDGE_KINDS[key];
                return h('span', { className: 'legend-item', role: 'listitem', key: key },
                  h('svg', { className: 'legend-line', viewBox: '0 0 26 8', 'aria-hidden': 'true' },
                    h('line', {
                      x1: 1, y1: 4, x2: 25, y2: 4, strokeWidth: 2,
                      stroke: item.color || MUTED, strokeDasharray: item.dash
                    })
                  ),
                  item.label
                );
              })),
              h('button', {
                className: 'canvas-theme',
                title: 'Switch the diagram to ' + (canvasTheme === 'dark' ? 'light' : 'dark'),
                onClick: function () {
                  setCanvasTheme(canvasTheme === 'dark' ? 'light' : 'dark');
                }
              }, canvasTheme === 'dark' ? 'Light' : 'Dark')
            )
          )
        ),
        h('aside', null,
          sel || showIntro ? h('button', {
            className: 'mobile-back',
            onClick: function () { setSel(null); setShowIntro(false); }
          }, 'Back to flow') : null,
          panel()
        )
      )
    );
  }

  ReactDOM.createRoot(document.getElementById('root'))
    .render(h(RF.ReactFlowProvider, null, h(App, null)));
})();
