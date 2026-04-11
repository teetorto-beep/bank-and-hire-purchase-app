const { withDangerousMod } = require('@expo/config-plugins');
const path = require('path');
const fs = require('fs');

const withGradleVersion = (config, { gradleVersion = '8.7' } = {}) => {
  return withDangerousMod(config, [
    'android',
    async (config) => {
      const gradleWrapperPath = path.join(
        config.modRequest.platformProjectRoot,
        'gradle/wrapper/gradle-wrapper.properties'
      );
      if (fs.existsSync(gradleWrapperPath)) {
        let content = fs.readFileSync(gradleWrapperPath, 'utf8');
        content = content.replace(
          /distributionUrl=https\\:\/\/services\.gradle\.org\/distributions\/gradle-[\d.]+-all\.zip/,
          `distributionUrl=https\\://services.gradle.org/distributions/gradle-${gradleVersion}-all.zip`
        );
        fs.writeFileSync(gradleWrapperPath, content);
        console.log(`[withGradleVersion] Set Gradle version to ${gradleVersion}`);
      }
      return config;
    },
  ]);
};

module.exports = withGradleVersion;
