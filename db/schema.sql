-- Sakthi Oil & Flour Mill — database schema
-- The server also creates these automatically on startup (see server.js),
-- so running this file by hand is optional. Kept here for reference and
-- for anyone who wants to provision the database manually.

CREATE TABLE IF NOT EXISTS users (
  id            INT AUTO_INCREMENT PRIMARY KEY,
  username      VARCHAR(50)  NOT NULL UNIQUE,
  password_hash VARCHAR(255) NOT NULL,
  name          VARCHAR(100) NOT NULL,
  role          ENUM('admin', 'staff') NOT NULL DEFAULT 'staff',
  created_at    DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS products (
  id          INT AUTO_INCREMENT PRIMARY KEY,
  name        VARCHAR(150) NOT NULL UNIQUE,
  category    ENUM('sales', 'service') NOT NULL,
  unit        VARCHAR(20)  NOT NULL,
  rate        DECIMAL(10,2) NOT NULL,
  created_at  DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at  DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS customers (
  id          INT AUTO_INCREMENT PRIMARY KEY,
  name        VARCHAR(150) NOT NULL,
  phone       VARCHAR(20)  NULL UNIQUE,
  created_at  DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at  DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS orders (
  id            INT AUTO_INCREMENT PRIMARY KEY,
  customer_name VARCHAR(150) NOT NULL,
  customer_id   INT NULL,
  product_id    INT NULL,
  product_name  VARCHAR(150) NOT NULL,
  unit          VARCHAR(20)  NOT NULL,
  quantity      DECIMAL(10,2) NOT NULL,
  rate          DECIMAL(10,2) NOT NULL,
  total         DECIMAL(10,2) NOT NULL,
  custom_rate   TINYINT(1) NOT NULL DEFAULT 0,
  tracked       TINYINT(1) NOT NULL DEFAULT 1,
  created_by    INT NULL,
  order_date    DATETIME NOT NULL,
  FOREIGN KEY (customer_id) REFERENCES customers(id) ON DELETE SET NULL,
  FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE SET NULL,
  FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL
);
