"use strict";

/* eslint-disable @typescript-eslint/no-require-imports */

const { expand } = require("brace-expansion-fixed");

// minimatch 3 expects the CommonJS export to be callable, while minimatch 10
// reads the named `expand` export. Keep both contracts backed by patched v5.
module.exports = expand;
module.exports.expand = expand;
