# Plate Perfect Pro

Build a modern, responsive web application for a Plate Printing Production Management System for a printing company. The application should be built using React, TypeScript, Tailwind CSS, ShadCN UI, Supabase, PostgreSQL and React Query.

The system should be production-ready, multi-user, and optimized for desktop use.

Objective

The purpose of the system is to:

Manage plate inventory.

Receive production jobs.

Calculate the number of printing plates required.

Optimize plate utilization.

Reuse offcuts before consuming new plates.

Track every plate from receipt until complete consumption.

Reduce material wastage.

Produce production reports and inventory reports.

The application should have a modern dashboard similar to ERP systems.

User Roles

Create role-based permissions.

Administrator

Can manage everything.

Production Manager

Can approve jobs.

Can allocate plates.

Can monitor inventory.

Can view reports.

Production Operator

Can create jobs.

Can record production.

Can consume plates.

Can view available inventory.

Store Keeper

Can receive stock.

Can create batches.

Can issue plates.

Can manage offcuts.

Management

Read-only dashboards and reports.

Dashboard

Display KPI cards.

Total Plates Available

Plates Reserved

Plates Used Today

Plates Received Today

Available Offcuts

Offcuts Utilized Today

Material Utilization %

Waste Generated Today

Jobs Pending

Jobs In Production

Completed Jobs

Include charts for:

Plate Consumption

Waste Trend

Offcut Utilization

Inventory by Manufacturer

Inventory by Plate Type

Monthly Material Usage

Production Volume

Plate Inventory Module

Each manufacturer supplies plates with identical dimensions:

42 x 60 inches

However, boxes may contain:

8 plates

10 plates

12 plates

When stock is received the system should convert boxes into individual plates.

Example

Manufacturer A

25 boxes

8 pieces each

=200 plates

Manufacturer B

10 boxes

12 pieces each

=120 plates

Inventory should always track individual plates rather than boxes.

Plate Batch fields:

Batch Number

Manufacturer

Plate Type

Plate Size

Thickness

Boxes Received

Pieces Per Box

Total Plates

Available Plates

Reserved Plates

Used Plates

Date Received

Supplier

Purchase Order

Cost Per Plate

Warehouse

Status

Individual Plate Tracking

Every plate must have its own unique ID.

Example

PLT-000001

Each plate should store:

Plate ID

Batch

Width

Height

Area

Status

Available

Reserved

Partially Used

Fully Consumed

Current Remaining Area

Customer Management

Store customer information.

Company

Contact Person

Phone

Email

Address

Production Job Module

Create production jobs.

Fields:

Job Number

Customer

Sales Order

Product

Width

Height

Quantity

Margin Top

Margin Bottom

Margin Left

Margin Right

Number of Colours

Due Date

Operator

Status

The system should automatically calculate the effective plate size.

Example

Artwork

18 x 25

Margins

1 inch all round

Effective Plate Size

20 x 27

Display calculations live while typing.

Plate Optimization Engine

This is the most important feature.

Plate size is fixed:

42 x 60 inches

The system must calculate:

How many finished plates fit onto one master plate.

Example

Required

20 x 27

Across

42 / 20 = 2

Down

60 / 27 = 2

Result

4 pieces

Display:

Number of plates required

Remaining waste

Material utilization %

Waste %

Allow rotation of artwork by 90 degrees if it results in better utilization.

The optimization engine should automatically compare both orientations and choose the best layout.

Cutting Layout Preview

Generate a graphical layout showing how jobs fit on a plate.

Display:

Master Plate

42 x 60

Cut lines

Artwork placement

Remaining offcuts

Show different colors for:

Allocated area

Unused area

Offcuts

Offcut Management

Any remaining material becomes reusable inventory.

Create an Offcut record.

Fields

Offcut ID

Parent Plate

Width

Height

Area

Shape

Date Created

Status

Available

Reserved

Used

Warehouse

Intelligent Offcut Search

Whenever a new job is created

The system MUST search available offcuts BEFORE opening a new plate.

Search logic

Width >= Required Width

Height >= Required Height

Status = Available

Choose the smallest usable offcut.

Display

"Suitable Offcut Found"

or

"No Suitable Offcut Available"

Plate Allocation Workflow

Job Created

↓

Search Offcuts

↓

Suitable Offcut Exists?

YES

Reserve Offcut

NO

Reserve New Plate

↓

Generate Cutting Layout

↓

Approve

↓

Consume Plate

↓

Generate New Offcuts

↓

Update Inventory

Production Completion

When production is completed

Automatically:

Reduce available plates

Consume allocated offcuts

Generate new offcuts

Update inventory

Update utilization statistics

Mark job completed

Inventory Management

Support:

Receiving

Transfers

Adjustments

Cycle Counts

Warehouse Locations

Batch Tracking

FIFO allocation

Plate Reservations

Barcode support

QR code support

Reports

Create professional reports.

Inventory Reports

Plate Movement

Plate Consumption

Offcut Inventory

Offcut Utilization

Waste Analysis

Material Utilization

Jobs by Customer

Jobs by Operator

Jobs by Date

Manufacturer Performance

Batch Traceability

Production Summary

Daily Production

Monthly Production

Material Cost Analysis

Notifications

Notify users when:

Stock below minimum

No suitable offcuts exist

Batch running low

Job overdue

Production completed

Large offcut available

Inventory discrepancy detected

Database Structure

Create normalized PostgreSQL tables.

Users

Roles

Customers

Manufacturers

Suppliers

Warehouses

Plate Batches

Plates

Offcuts

Jobs

Job Items

Plate Allocations

Offcut Allocations

Plate Consumption

Inventory Transactions

Reports

Audit Logs

Settings

Audit Trail

Track every action.

User

Timestamp

Old Value

New Value

Device

IP Address

Search

Global search should find:

Job Number

Customer

Plate

Batch

Offcut

Manufacturer

Operator

Sales Order

UI Design

Use a clean ERP-style interface.

Features:

Responsive Layout

Left Navigation

Top Toolbar

Dark Mode

Light Mode

Quick Search

Breadcrumbs

Advanced Filters

Pagination

Export to Excel

Export to PDF

Print Reports

Keyboard Shortcuts

Confirmation Dialogs

Toast Notifications

Loading Skeletons

Empty States

Professional Charts

Technical Requirements

Use:

React

TypeScript

Vite

Tailwind CSS

ShadCN UI

Supabase

PostgreSQL

React Query

React Hook Form

Zod Validation

Recharts

Lucide Icons

Row Level Security

Authentication

Role-Based Access Control

Future AI Features

Design the architecture so future AI modules can:

Recommend the best cutting layout.

Predict future plate consumption.

Suggest the best offcut to use.

Estimate waste before production.

Optimize multiple jobs together using advanced nesting algorithms.

Forecast inventory replenishment.

Detect unusual material losses.

The codebase should be modular, scalable, production-ready, and follow best practices, with reusable components, a clean folder structure, responsive UI, and well-documented business logic.

This project was built with [Lovable](https://lovable.dev).

**Live app**: https://plate-works.lovable.app

## Build with Lovable

Continue developing this project in the [Lovable editor](https://lovable.dev/projects/9fea6a5c-54ff-46a6-a274-5c7c1ac93958).

- **Ship faster**: describe what you want to build and Lovable handles the code.
- **Stay in sync**: every change made in Lovable is committed straight to this repository.
- **Full ownership**: this code is yours. Push to `main` on GitHub and your changes sync back into Lovable, ready for your next prompt.

## Development

Prefer working locally? You need Node.js and npm — [install with nvm](https://github.com/nvm-sh/nvm#installing-and-updating).

```sh
git clone <this-repository-url>
cd <repository-name>
npm i
npm run dev
```
