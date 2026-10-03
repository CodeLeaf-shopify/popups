import db from "../db.server";

/**
 * Removes all Leaf Popups rows for a shop from Prisma.
 * Customer PII is not stored here — engagement lives in Shopify customer metafields.
 */
export async function eraseShopData(shop: string): Promise<void> {
  await db.$transaction([
    db.session.deleteMany({ where: { shop } }),
    db.popupDailyStat.deleteMany({ where: { shop } }),
    db.shopBilling.deleteMany({ where: { shop } }),
    db.popupTest.deleteMany({ where: { shop } }),
    db.popup.deleteMany({ where: { shop } }),
    db.publication.deleteMany({ where: { shop } }),
    db.shopSettings.deleteMany({ where: { shop } }),
  ]);
}
