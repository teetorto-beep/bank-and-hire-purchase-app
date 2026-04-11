#!/usr/bin/env node
/**
 * Postinstall script: patch gradle-wrapper.properties to use 8.7
 * EAS runs npm install (triggering this) before expo prebuild,
 * so prebuild picks up the patched version.
 */
const fs = require('fs');
const path = require('path');

const TARGET_VERSION = '8.7';
const files = [
  path.join(__dirname, '../android/gradle/wrapper/gradle-wrapper.properties'),
  path.join(__dirname, '../node_modules/@react-native/gradle-plugin/gradle/wrapper/gradle-wrapper.properties'),
];

files.forEach((filePath) => {
  if (!fs.existsSync(filePath)) return;
  let content = fs.readFileSync(filePath, 'utf8');
  const updated = content.replace(
    /distributionUrl=https\\:\/\/services\.gradle\.org\/distributions\/gradle-[\d.]+-all\.zip/,
    `distributionUrl=https\\://services.gradle.org/distributions/gradle-${TARGET_VERSION}-all.zip`
  );
  if (updated !== content) {
    fs.writeFileSync(filePath, updated);
    console.log(`[fix-gradle] Patched ${path.basename(path.dirname(path.dirname(filePath)))} -> Gradle ${TARGET_VERSION}`);
  }
});
