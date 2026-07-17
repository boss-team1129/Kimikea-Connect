# Kimikea Connect Data Model

## ID policy

- `userId`: immutable user ID. Used for style posts, saved styles, sessions, profile ownership, and operation permissions.
- `shopId`: immutable shop ID. Used for orders, invoices, shop permissions, map/shop style filtering, and shop-level data.
- `loginId`: login identifier. Currently synchronized with email. Changing email updates `loginId` and email only; it must not change `userId` or `shopId`.

Display fields such as salon name, staff name, and email are not primary keys.

## Current ER diagram

```mermaid
erDiagram
  SHOP_MASTER {
    string shopId PK
    string salonName
    string loginId
    string email
    string status
    datetime createdAt
  }

  USER_MASTER {
    string userId PK
    string shopId FK
    string staffName
    string role
    string passwordHash
    datetime lastLogin
    datetime createdAt
  }

  STYLE_POST {
    string id PK
    string authorId FK
    string shopId FK
    string salonName
    string staffName
    string extensionColorIds
    string status
    boolean isPublished
    datetime createdAt
  }

  STYLE_SAVE {
    string id PK
    string userId FK
    string stylePostId FK
    datetime createdAt
  }

  ORDER {
    string orderNo PK
    string shopId FK
    string userId FK
    string franchiseId
    number invoiceTotal
    string shippingStatus
    datetime orderDate
  }

  ORDER_DETAIL {
    string orderNo FK
    string productCode FK
    string colorName
    number quantity
    number invoiceUnitPrice
    number lineTotal
  }

  INVOICE {
    string invoiceId PK
    string shopId FK
    string targetMonth
    number invoiceTotal
    string paymentStatus
  }

  PRODUCT_MASTER {
    string productCode PK
    string category
    string colorName
    boolean visible
    string colorGroup
  }

  SHOP_MASTER ||--o{ USER_MASTER : has_staff
  SHOP_MASTER ||--o{ STYLE_POST : owns
  USER_MASTER ||--o{ STYLE_POST : authors
  USER_MASTER ||--o{ STYLE_SAVE : saves
  STYLE_POST ||--o{ STYLE_SAVE : saved_as
  SHOP_MASTER ||--o{ ORDER : places
  USER_MASTER ||--o{ ORDER : creates
  ORDER ||--o{ ORDER_DETAIL : contains
  PRODUCT_MASTER ||--o{ ORDER_DETAIL : ordered_as
  SHOP_MASTER ||--o{ INVOICE : billed_to
```

## Spreadsheet mapping

Current production compatibility:

- `SHOP_MASTER` is represented by `加盟店マスタ`.
- `USER_MASTER` is represented by `ユーザーマスタ`.
- Existing `加盟店マスタ` rows still contain compatibility fields such as `memberId`, `userId`, `shopId`, `role`, and password columns.
- New setup/sync copies user fields into `ユーザーマスタ` so future multi-staff login can be added without changing historical shop data.

## Query rules

- My posts: `STYLE_POST.authorId == currentUser.userId`
- Saved styles: `STYLE_SAVE.userId == currentUser.userId`
- Shop styles: `STYLE_POST.shopId == selectedShopId`
- Orders: `ORDER.shopId == currentUser.shopId`, with legacy fallback to `加盟店ID`
- Invoices: `INVOICE.shopId == currentUser.shopId`
- Permissions: `userId`, `shopId`, and `role`

