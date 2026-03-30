const { getDefaultConfig } = require('expo/metro-config');
const path = require('path');

const projectRoot = __dirname;
const monorepoRoot = path.resolve(projectRoot, '..');

const config = getDefaultConfig(projectRoot);

// Force absolute project root (critical for monorepo builds)
config.projectRoot = projectRoot;

// Watch the mobile folder + root node_modules (for hoisted deps)
config.watchFolders = [monorepoRoot];

// Make sure Metro resolves from mobile first, then root
config.resolver.nodeModulesPaths = [
  path.resolve(projectRoot, 'node_modules'),
  path.resolve(monorepoRoot, 'node_modules'),
];

module.exports = config;
