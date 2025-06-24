import mysql from 'mysql2/promise';
import { getConfigValue } from './util.js';

const dbConfig = {
    host: getConfigValue('database.host', 'localhost', 'string'),
    user: getConfigValue('database.user', 'root', 'string'),
    password: getConfigValue('database.password', '', 'string'),
    database: getConfigValue('database.database', 'sillytavern', 'string'),
    port: getConfigValue('database.port', 3306, 'number'),
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0
};

const pool = mysql.createPool(dbConfig);

/**
 * Executes a SQL query.
 * @param {string} sql The SQL query to execute.
 * @param {any[]} [params] The parameters to bind to the query.
 * @returns {Promise<[any[], any]>}
 */
export async function query(sql, params) {
    const [results, fields] = await pool.execute(sql, params);
    return [results, fields];
}

console.log('MySQL connection pool created.');