const { withGradleProperties } = require('@expo/config-plugins');
const path = require('path');
const fs = require('fs');

// Custom plugin to set the Gradle wrapper version
const withGradleVersion = (config, { gradleVersion = '8.6' } = {}) => {
  return withGradleProperties(config, (config) => {
    // Update gradle-wrapper.properties
    const gradleWrapperPath = path.join(
      config.modRequest.platformProjectRoot,
      'gradle/wrapper/gradle-wrapper.properties'
    );
    if (fs.existsSync(gradleWrapperPath)) {
      let content = fs.readFileSync(gradleWrapperPath, 'utf8');
      content = content.replace(
        /distributionUrl=.*gradle-.*\.zip/,
        `distributionUrl=https\\://services.gradle.org/distributions/gradle-${gradleVersion}-all.zip`
      );
      fs.writeFileSync(gradleWrapperPath, content);
    }
    return config;
  });
};

module.exports = withGradleVersion;
