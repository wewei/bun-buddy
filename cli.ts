#!/usr/bin/env bun
// Set CLI mode to prevent service auto-start
process.env.CLI_MODE = 'true';
import './src/cli/index.ts';