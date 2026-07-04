import CustomerHome from "@/components/CustomerHome";

// Customer home (manual login: phone + any delivery reference). Customers
// arriving from a home link land on /customer/[token] instead — no typing.
export default function CustomerHomePage() {
  return <CustomerHome />;
}
