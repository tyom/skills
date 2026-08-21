#!/usr/bin/env bash
# Regenerate vendor.js and vendor.css from pinned UMD builds.
# ponytail: curl + cat, no bundler. React 18 because 19 dropped UMD builds.
# Globals the template relies on, in load order:
#   React, ReactDOM, dagre, jsxRuntime (shimmed below), ReactFlow
set -euo pipefail
cd "$(dirname "${BASH_SOURCE[0]}")"

REACT=18.3.1
XYFLOW=12.11.3
DAGRE=1.1.5

fetch() { curl -fsSL "https://unpkg.com/$1"; }

{
  fetch "react@$REACT/umd/react.production.min.js"
  echo
  fetch "react-dom@$REACT/umd/react-dom.production.min.js"
  echo
  fetch "@dagrejs/dagre@$DAGRE/dist/dagre.min.js"
  echo
  # @xyflow/react's UMD wrapper reads `react/jsx-runtime` off window.jsxRuntime,
  # which React 18's UMD build does not ship. createElement covers it: it already
  # extracts `key` from props and already uses props.children.
  cat <<'JS'
;(function () {
  function jsx(type, props, key) {
    return React.createElement(
      type,
      key === undefined ? props : Object.assign({}, props, { key: key })
    );
  }
  window.jsxRuntime = { Fragment: React.Fragment, jsx: jsx, jsxs: jsx, jsxDEV: jsx };
})();
JS
  fetch "@xyflow/react@$XYFLOW/dist/umd/index.js"
} > vendor.js

fetch "@xyflow/react@$XYFLOW/dist/style.css" > vendor.css

ls -lh vendor.js vendor.css
