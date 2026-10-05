import { PRODUCTS, type ProductKey } from "@/lib/products";

/** A product's name with its plain descriptor after it, e.g. in a page heading: «مُطابِق  مطابقة الفاتورة». */
export function ProductName({ product, descriptorClassName }: { product: ProductKey; descriptorClassName?: string }) {
  const p = PRODUCTS[product];
  return (
    <>
      {p.name}
      <span className={descriptorClassName ?? "ms-2 align-middle text-[0.55em] font-medium text-muted-foreground"}>{p.descriptor}</span>
    </>
  );
}
