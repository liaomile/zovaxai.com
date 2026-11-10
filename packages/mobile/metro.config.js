const { getDefaultConfig, mergeConfig } = require('@react-native/metro-config');

/**
 * Metro 配置（RN 模板标准文件）。
 * 注意：platform-api 以 file: 依赖引入，其源码在 ../platform-api，
 * 若打包时报模块解析越界，再在此处补 watchFolders 指向仓库 packages/ 目录。
 */
const config = {};

module.exports = mergeConfig(getDefaultConfig(__dirname), config);
