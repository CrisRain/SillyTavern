# SillyTavern (非官方修改版)

这是一个 [SillyTavern](https://github.com/SillyTavern/SillyTavern) 的非官方修改版。SillyTavern 是一个用于AI角色扮演的本地化前端界面。

## 与官方版本的差异

这个版本在官方代码的基础上进行了一些修改，主要包括：

1.  **数据库集成**:
    *   添加了 `bcrypt` 和 `mysql2` 依赖。
    *   修改了用户登录认证逻辑，使用 MySQL 数据库来存储和验证用户信息，以取代原有的简单认证机制(兼容Newapi数用户表格式)。

2.  **代码现代化**:
    *   重构了部分文件系统相关的操作，使用了更现代的 `async/await` 语法，以提高代码的性能（防止Eventloop被阻塞）。

## 安装和运行

安装和运行方式与官方版本基本相同。请参考官方文档：[SillyTavern Documentation](https://docs.sillytavern.app/)。

**注意**: 由于数据库的集成，您需要自行配置 MySQL 数据库连接信息。

**config.yaml**
```
database:
  host: '127.0.0.1'
  user: ''
  password: ''
  database: ''
  port: 3306
```

## 更新

本分支的更新落后于官方版本，并非定期同步官方版本特性。
