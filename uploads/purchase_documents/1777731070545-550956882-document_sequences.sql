-- phpMyAdmin SQL Dump
-- version 5.2.3
-- https://www.phpmyadmin.net/
--
-- Host: db
-- Generation Time: Apr 30, 2026 at 02:29 PM
-- Server version: 8.0.43
-- PHP Version: 8.3.26

SET SQL_MODE = "NO_AUTO_VALUE_ON_ZERO";
START TRANSACTION;
SET time_zone = "+00:00";


/*!40101 SET @OLD_CHARACTER_SET_CLIENT=@@CHARACTER_SET_CLIENT */;
/*!40101 SET @OLD_CHARACTER_SET_RESULTS=@@CHARACTER_SET_RESULTS */;
/*!40101 SET @OLD_COLLATION_CONNECTION=@@COLLATION_CONNECTION */;
/*!40101 SET NAMES utf8mb4 */;

--
-- Database: `bizcore`
--

-- --------------------------------------------------------

--
-- Table structure for table `document_sequences`
--

CREATE TABLE `document_sequences` (
  `id` int NOT NULL,
  `document_type` varchar(10) NOT NULL COMMENT 'ประเภทเอกสาร (QT, BN, INV, RE)',
  `prefix` varchar(10) NOT NULL COMMENT 'คำนำหน้า (เช่น QT-, BN-, INV-)',
  `year` int NOT NULL COMMENT 'ปี ค.ศ. (เช่น 2026)',
  `month` int NOT NULL COMMENT 'เดือน (1-12)',
  `last_number` int NOT NULL DEFAULT '0' COMMENT 'เลขล่าสุดที่ถูกใช้งาน',
  `padding_length` int NOT NULL DEFAULT '4' COMMENT 'จำนวนหลักตัวเลข (เช่น 4 คือ 0001)',
  `updated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci COMMENT='ตารางรันเลขที่เอกสารแบบสากล';

--
-- Dumping data for table `document_sequences`
--

INSERT INTO `document_sequences` (`id`, `document_type`, `prefix`, `year`, `month`, `last_number`, `padding_length`, `updated_at`) VALUES
(1, 'QT', 'QT-', 2026, 2, 1, 4, '2026-02-26 08:17:24'),
(2, 'BN', 'BN-', 2026, 2, 1, 4, '2026-02-28 01:34:03'),
(3, 'RE', 'RE-', 2026, 2, 0, 4, '2026-02-26 08:46:00'),
(4, 'INV', 'INV-', 2026, 2, 2, 4, '2026-02-26 09:19:08'),
(8, 'JOB', 'JOB-', 2026, 4, 610, 4, '2026-04-30 08:32:58'),
(13, 'QT', 'QT-', 2026, 3, 2, 4, '2026-04-07 04:52:11'),
(14, 'PR', 'PR-', 2026, 3, 4, 4, '2026-03-27 01:51:58'),
(15, 'PO', 'PO-', 2026, 3, 13, 4, '2026-03-27 01:53:24'),
(16, 'GR', 'GR-', 2026, 3, 4, 4, '2026-03-27 01:54:43'),
(17, 'AP', 'AP-', 2026, 3, 3, 4, '2026-03-11 06:05:42'),
(18, 'PV', 'PV-', 2026, 3, 1, 4, '2026-03-06 04:34:57'),
(19, 'INV', 'INV-', 2026, 3, 23, 4, '2026-03-27 06:41:12'),
(20, 'BN', 'BN-', 2026, 3, 3, 4, '2026-03-10 07:23:36'),
(35, 'ITM', 'ITM-', 2026, 3, 128, 4, '2026-03-31 02:48:33'),
(179, 'BOX', 'P', 2026, 3, 84, 6, '2026-03-26 02:02:59'),
(194, 'BOX', 'BOX-', 2026, 4, 3, 4, '2026-04-23 05:57:30'),
(196, 'INV', 'INV-', 2026, 4, 181, 4, '2026-04-30 13:30:05'),
(203, 'ITM', 'ITM-', 2026, 4, 8, 4, '2026-04-21 06:48:11'),
(207, 'PO', 'PO-', 2026, 4, 6, 4, '2026-04-29 07:50:45'),
(221, 'MPR', 'MPR-', 2026, 4, 1, 3, '2026-04-21 08:13:12'),
(222, 'PR', 'PR-', 2026, 4, 2, 4, '2026-04-29 07:17:19'),
(224, 'GR', 'GR-', 2026, 4, 2, 4, '2026-04-29 07:51:06'),
(239, 'D-INV', 'D-INV-', 2026, 4, 1, 4, '2026-04-22 05:18:03'),
(246, 'RE', 'RE-', 2026, 4, 3, 4, '2026-04-24 01:01:52'),
(324, 'BN', 'BN-', 2026, 4, 1, 4, '2026-04-25 07:33:46'),
(363, 'AP', 'AP-', 2026, 4, 1, 4, '2026-04-29 07:52:36');

--
-- Indexes for dumped tables
--

--
-- Indexes for table `document_sequences`
--
ALTER TABLE `document_sequences`
  ADD PRIMARY KEY (`id`),
  ADD UNIQUE KEY `idx_doc_type_year_month` (`document_type`,`year`,`month`);

--
-- AUTO_INCREMENT for dumped tables
--

--
-- AUTO_INCREMENT for table `document_sequences`
--
ALTER TABLE `document_sequences`
  MODIFY `id` int NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=409;
COMMIT;

/*!40101 SET CHARACTER_SET_CLIENT=@OLD_CHARACTER_SET_CLIENT */;
/*!40101 SET CHARACTER_SET_RESULTS=@OLD_CHARACTER_SET_RESULTS */;
/*!40101 SET COLLATION_CONNECTION=@OLD_COLLATION_CONNECTION */;
