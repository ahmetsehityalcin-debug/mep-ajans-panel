"use client";

import { useEffect, useMemo, useState } from "react";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

const statuses = ["Onay Bekliyor", "Üretimde", "Teslim Edildi"];
const methods = ["Nakit", "Havale/EFT", "Kredi Kartı", "Diğer"];

function money(value: number) {
  return new Intl.NumberFormat("tr-TR", {
    style: "currency",
    currency: "TRY",
  }).format(value || 0);
}

export default function Home() {
  const [user, setUser] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  const [customers, setCustomers] = useState<any[]>([]);
  const [orders, setOrders] = useState<any[]>([]);
  const [payments, setPayments] = useState<any[]>([]);
  const [suppliers, setSuppliers] = useState<any[]>([]);
  const [supplierInvoices, setSupplierInvoices] = useState<any[]>([]);
  const [search, setSearch] = useState("");

  const [customerName, setCustomerName] = useState("");
  const [selectedCustomer, setSelectedCustomer] = useState("");
  const [status, setStatus] = useState("Onay Bekliyor");
  const [items, setItems] = useState([
    { description: "", quantity: "1", unitPrice: "" },
  ]);

  const [paymentCustomer, setPaymentCustomer] = useState("");
  const [paymentOrder, setPaymentOrder] = useState("");
  const [paymentAmount, setPaymentAmount] = useState("");
  const [paymentMethod, setPaymentMethod] = useState("Nakit");

  const [supplierName, setSupplierName] = useState("");
  const [selectedSupplier, setSelectedSupplier] = useState("");
  const [invoiceDescription, setInvoiceDescription] = useState("");
  const [invoiceAmount, setInvoiceAmount] = useState("");

  useEffect(() => {
    checkUser();
  }, []);

  async function checkUser() {
    const {
      data: { session },
    } = await supabase.auth.getSession();

    setUser(session?.user || null);

    if (session?.user) {
      await refreshAll();
    }

    setLoading(false);
  }

  async function login() {
    const { error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (error) {
      alert(error.message);
      return;
    }

    await checkUser();
  }

  async function logout() {
    await supabase.auth.signOut();
    setUser(null);
  }

  async function refreshAll() {
    const { data: customersData } = await supabase
      .from("customers")
      .select("*")
      .order("created_at", { ascending: false });

    const { data: ordersData } = await supabase
      .from("orders")
      .select("*, customers(name), order_items(*), customer_payments(*)")
      .order("created_at", { ascending: false });

    const { data: paymentsData } = await supabase
      .from("customer_payments")
      .select("*, customers(name), orders(order_no)")
      .order("created_at", { ascending: false });

    const { data: suppliersData } = await supabase
      .from("suppliers")
      .select("*")
      .order("created_at", { ascending: false });

    const { data: invoicesData } = await supabase
      .from("supplier_invoices")
      .select("*, suppliers(name)")
      .order("created_at", { ascending: false });

    setCustomers(customersData || []);
    setOrders(ordersData || []);
    setPayments(paymentsData || []);
    setSuppliers(suppliersData || []);
    setSupplierInvoices(invoicesData || []);
  }

  function orderTotal(order: any) {
    return (order.order_items || []).reduce(
      (sum: number, item: any) => sum + Number(item.total_price || 0),
      0
    );
  }

  function orderPaid(order: any) {
    return (order.customer_payments || []).reduce(
      (sum: number, payment: any) => sum + Number(payment.amount || 0),
      0
    );
  }

  const totalRevenue = orders.reduce(
    (sum, order) => sum + orderTotal(order),
    0
  );

  const totalPaid = payments.reduce(
    (sum, p) => sum + Number(p.amount || 0),
    0
  );

  const totalReceivable = totalRevenue - totalPaid;

  const totalSupplierDebt = supplierInvoices
    .filter((i) => !i.is_paid)
    .reduce((sum, i) => sum + Number(i.amount || 0), 0);

  const customerBalances = useMemo(() => {
    return customers.map((customer) => {
      const sales = orders
        .filter((order) => order.customer_id === customer.id)
        .reduce((sum, order) => sum + orderTotal(order), 0);

      const paid = payments
        .filter((payment) => payment.customer_id === customer.id)
        .reduce((sum, payment) => sum + Number(payment.amount || 0), 0);

      return { ...customer, sales, paid, balance: sales - paid };
    });
  }, [customers, orders, payments]);

  const cleanSearch = search.trim().toLocaleLowerCase("tr-TR");

  const filteredOrders = cleanSearch
    ? orders.filter((order) => {
        const customerName = order.customers?.name || "";
        const itemsText = (order.order_items || [])
          .map((item: any) => item.description)
          .join(" ");

        const text =
          `${order.order_no} ${customerName} ${order.status} ${itemsText}`.toLocaleLowerCase(
            "tr-TR"
          );

        return text.includes(cleanSearch);
      })
    : orders;

  const filteredCustomers = cleanSearch
    ? customerBalances.filter((customer) => {
        const text = `${customer.name} ${
          customer.phone || ""
        }`.toLocaleLowerCase("tr-TR");

        return text.includes(cleanSearch);
      })
    : customerBalances;

  const paymentCustomerOrders = orders.filter(
    (order) => order.customer_id === paymentCustomer
  );

  async function addCustomer() {
    if (!customerName.trim()) return;

    const { error } = await supabase
      .from("customers")
      .insert({ name: customerName.trim() });

    if (error) return alert(error.message);

    setCustomerName("");
    refreshAll();
  }

  function addItemRow() {
    setItems([...items, { description: "", quantity: "1", unitPrice: "" }]);
  }

  function removeItemRow(index: number) {
    if (items.length === 1) return;
    setItems(items.filter((_, i) => i !== index));
  }

  function updateItem(index: number, field: string, value: string) {
    setItems(
      items.map((item, i) =>
        i === index ? { ...item, [field]: value } : item
      )
    );
  }

  async function addOrder() {
    if (!selectedCustomer) return alert("Müşteri seçmelisin abi.");

    const validItems = items.filter((item) => item.description.trim());
    if (validItems.length === 0) return alert("En az bir ürün yazmalısın abi.");

    const { data: orderData, error: orderError } = await supabase
      .from("orders")
      .insert({ customer_id: selectedCustomer, status })
      .select()
      .single();

    if (orderError) return alert(orderError.message);

    const rows = validItems.map((item) => ({
      order_id: orderData.id,
      description: item.description.trim(),
      quantity: Number(item.quantity || 1),
      unit_price: Number(item.unitPrice || 0),
    }));

    const { error: itemError } = await supabase
      .from("order_items")
      .insert(rows);

    if (itemError) return alert(itemError.message);

    setSelectedCustomer("");
    setStatus("Onay Bekliyor");
    setItems([{ description: "", quantity: "1", unitPrice: "" }]);
    refreshAll();
  }

  async function addPayment() {
    if (!paymentCustomer) return alert("Müşteri seçmelisin abi.");
    if (!paymentAmount) return alert("Ödeme tutarı yazmalısın abi.");

    const { error } = await supabase.from("customer_payments").insert({
      customer_id: paymentCustomer,
      order_id: paymentOrder || null,
      amount: Number(paymentAmount),
      method: paymentMethod,
    });

    if (error) return alert(error.message);

    setPaymentCustomer("");
    setPaymentOrder("");
    setPaymentAmount("");
    setPaymentMethod("Nakit");
    refreshAll();
  }

  async function changeStatus(order: any) {
    const newStatus = prompt(
      "Yeni durum yaz:\nOnay Bekliyor\nÜretimde\nTeslim Edildi",
      order.status
    );

    if (!newStatus) return;

    if (!statuses.includes(newStatus)) {
      return alert(
        "Durum sadece: Onay Bekliyor, Üretimde veya Teslim Edildi olabilir."
      );
    }

    const { error } = await supabase
      .from("orders")
      .update({ status: newStatus })
      .eq("id", order.id);

    if (error) return alert(error.message);

    refreshAll();
  }

  async function deleteOrder(orderId: string) {
    if (!confirm("Sipariş silinsin mi?")) return;

    const { error } = await supabase.from("orders").delete().eq("id", orderId);

    if (error) return alert(error.message);

    refreshAll();
  }

  async function addSupplier() {
    if (!supplierName.trim()) return;

    const { error } = await supabase
      .from("suppliers")
      .insert({ name: supplierName.trim() });

    if (error) return alert(error.message);

    setSupplierName("");
    refreshAll();
  }

  async function addSupplierInvoice() {
    if (!selectedSupplier) return alert("Tedarikçi seç abi.");
    if (!invoiceAmount) return alert("Tutar yaz abi.");

    const { error } = await supabase.from("supplier_invoices").insert({
      supplier_id: selectedSupplier,
      description: invoiceDescription || "Gider / Fatura",
      amount: Number(invoiceAmount),
      is_paid: false,
    });

    if (error) return alert(error.message);

    setSelectedSupplier("");
    setInvoiceDescription("");
    setInvoiceAmount("");
    refreshAll();
  }

  async function markInvoicePaid(invoiceId: string) {
    const { error } = await supabase
      .from("supplier_invoices")
      .update({ is_paid: true })
      .eq("id", invoiceId);

    if (error) return alert(error.message);

    refreshAll();
  }

  if (loading) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-slate-100">
        <p>Yükleniyor...</p>
      </main>
    );
  }

  if (!user) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-slate-100 p-6">
        <div className="w-full max-w-md rounded-3xl bg-white p-8 shadow">
          <h1 className="mb-2 text-center text-3xl font-bold text-red-800">
            MEP AJANS
          </h1>
          <p className="mb-6 text-center text-slate-500">
            İşletme Paneli Giriş
          </p>

          <div className="space-y-3">
            <input
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="E-mail"
              className="w-full rounded-xl border p-3"
            />

            <input
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              type="password"
              placeholder="Şifre"
              className="w-full rounded-xl border p-3"
            />

            <button
              onClick={login}
              className="w-full rounded-xl bg-red-800 px-6 py-3 font-bold text-white"
            >
              Giriş Yap
            </button>
          </div>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-slate-100 p-6 text-slate-900">
      <div className="mx-auto max-w-7xl">
        <div className="mb-6 flex items-center justify-between rounded-3xl bg-white p-6 shadow">
          <div>
            <h1 className="text-3xl font-bold text-red-800">MEP AJANS</h1>
            <p className="text-slate-500">
              Matbaa | Etiket | Promosyon İşletme Paneli
            </p>
          </div>

          <button
            onClick={logout}
            className="rounded-xl bg-black px-4 py-2 text-sm font-bold text-white"
          >
            Çıkış Yap
          </button>
        </div>

        <div className="mb-6 rounded-3xl bg-white p-6 shadow">
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Müşteri adı, sipariş no, ürün veya durum ara..."
            className="w-full rounded-xl border p-3 outline-none focus:ring-2 focus:ring-red-200"
          />
        </div>

        <div className="grid gap-4 md:grid-cols-5">
          <Box title="Toplam Müşteri" value={customers.length} />
          <Box title="Toplam Ciro" value={money(totalRevenue)} />
          <Box title="Toplam Alacak" value={money(totalReceivable)} red />
          <Box title="Tedarikçi Borcu" value={money(totalSupplierDebt)} red />
          <Box title="Kasa Bakiyesi" value={money(totalPaid)} dark />
        </div>

        <div className="mt-6 grid gap-6 lg:grid-cols-2">
          <Panel title="Müşteri Ekle">
            <div className="flex gap-2">
              <input
                value={customerName}
                onChange={(e) => setCustomerName(e.target.value)}
                placeholder="Müşteri adı"
                className="flex-1 rounded-xl border p-3"
              />
              <button
                onClick={addCustomer}
                className="rounded-xl bg-red-800 px-6 py-3 font-bold text-white"
              >
                Ekle
              </button>
            </div>
          </Panel>

          <Panel title="Ödeme Ekle">
            <div className="space-y-3">
              <select
                value={paymentCustomer}
                onChange={(e) => {
                  setPaymentCustomer(e.target.value);
                  setPaymentOrder("");
                }}
                className="w-full rounded-xl border p-3"
              >
                <option value="">Müşteri seç</option>
                {customers.map((customer) => (
                  <option key={customer.id} value={customer.id}>
                    {customer.name}
                  </option>
                ))}
              </select>

              <select
                value={paymentOrder}
                onChange={(e) => setPaymentOrder(e.target.value)}
                className="w-full rounded-xl border p-3"
              >
                <option value="">Genel ödeme / siparişe bağlama</option>
                {paymentCustomerOrders.map((order) => (
                  <option key={order.id} value={order.id}>
                    Sipariş #{order.order_no} - {money(orderTotal(order))}
                  </option>
                ))}
              </select>

              <input
                value={paymentAmount}
                onChange={(e) => setPaymentAmount(e.target.value)}
                placeholder="Ödeme tutarı"
                type="number"
                className="w-full rounded-xl border p-3"
              />

              <select
                value={paymentMethod}
                onChange={(e) => setPaymentMethod(e.target.value)}
                className="w-full rounded-xl border p-3"
              >
                {methods.map((method) => (
                  <option key={method}>{method}</option>
                ))}
              </select>

              <button
                onClick={addPayment}
                className="w-full rounded-xl bg-green-700 px-6 py-3 font-bold text-white"
              >
                Ödeme Kaydet
              </button>
            </div>
          </Panel>
        </div>

        <Panel title="Sipariş Ekle" className="mt-6">
          <div className="space-y-3">
            <select
              value={selectedCustomer}
              onChange={(e) => setSelectedCustomer(e.target.value)}
              className="w-full rounded-xl border p-3"
            >
              <option value="">Müşteri seç</option>
              {customers.map((customer) => (
                <option key={customer.id} value={customer.id}>
                  {customer.name}
                </option>
              ))}
            </select>

            <select
              value={status}
              onChange={(e) => setStatus(e.target.value)}
              className="w-full rounded-xl border p-3"
            >
              {statuses.map((s) => (
                <option key={s}>{s}</option>
              ))}
            </select>

            {items.map((item, index) => (
              <div key={index} className="rounded-2xl border bg-slate-50 p-4">
                <div className="mb-2 flex justify-between">
                  <p className="font-bold">Ürün {index + 1}</p>
                  {items.length > 1 && (
                    <button
                      onClick={() => removeItemRow(index)}
                      className="font-bold text-red-700"
                    >
                      Sil
                    </button>
                  )}
                </div>

                <input
                  value={item.description}
                  onChange={(e) =>
                    updateItem(index, "description", e.target.value)
                  }
                  placeholder="Ürün açıklaması"
                  className="mb-3 w-full rounded-xl border p-3"
                />

                <div className="grid gap-3 md:grid-cols-3">
                  <input
                    value={item.quantity}
                    onChange={(e) =>
                      updateItem(index, "quantity", e.target.value)
                    }
                    placeholder="Adet"
                    type="number"
                    className="rounded-xl border p-3"
                  />
                  <input
                    value={item.unitPrice}
                    onChange={(e) =>
                      updateItem(index, "unitPrice", e.target.value)
                    }
                    placeholder="Birim fiyat"
                    type="number"
                    className="rounded-xl border p-3"
                  />
                  <div className="rounded-xl bg-white p-3 font-bold">
                    {money(
                      Number(item.quantity || 0) * Number(item.unitPrice || 0)
                    )}
                  </div>
                </div>
              </div>
            ))}

            <button
              onClick={addItemRow}
              className="w-full rounded-xl border border-dashed border-red-300 bg-red-50 px-6 py-3 font-bold text-red-800"
            >
              + Ürün Ekle
            </button>

            <button
              onClick={addOrder}
              className="w-full rounded-xl bg-red-800 px-6 py-3 font-bold text-white"
            >
              Sipariş Kaydet
            </button>
          </div>
        </Panel>

        <div className="mt-6 grid gap-6 lg:grid-cols-2">
          <Panel title="Siparişler">
            <div className="space-y-3">
              {filteredOrders.map((order) => {
                const total = orderTotal(order);
                const paid = orderPaid(order);
                const remaining = total - paid;

                return (
                  <div key={order.id} className="rounded-2xl border p-4">
                    <div className="flex justify-between gap-4">
                      <div>
                        <p className="font-bold">
                          Sipariş #{order.order_no} — {order.customers?.name}
                        </p>
                        <p className="text-sm text-slate-500">
                          Tarih: {order.order_date}
                        </p>
                      </div>

                      <div className="text-right">
                        <p className="font-bold">{money(total)}</p>
                        <button
                          onClick={() => changeStatus(order)}
                          className="text-sm font-bold text-red-700"
                        >
                          {order.status} (Değiştir)
                        </button>
                        <p className="text-sm text-slate-500">
                          Ödenen: {money(paid)}
                        </p>
                        <p className="text-sm font-bold text-red-700">
                          Kalan: {money(remaining)}
                        </p>
                        <button
                          onClick={() => deleteOrder(order.id)}
                          className="mt-2 rounded-xl bg-red-700 px-4 py-2 text-sm font-bold text-white"
                        >
                          Siparişi Sil
                        </button>
                      </div>
                    </div>

                    <div className="mt-3 space-y-2">
                      {(order.order_items || []).map((item: any) => (
                        <div
                          key={item.id}
                          className="rounded-xl bg-slate-50 p-3 text-sm"
                        >
                          <p className="font-semibold">{item.description}</p>
                          <p className="text-slate-500">
                            {item.quantity} adet × {money(item.unit_price)} ={" "}
                            {money(item.total_price)}
                          </p>
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          </Panel>

          <Panel title="Müşteri Cari">
            <div className="space-y-3">
              {filteredCustomers.map((customer) => (
                <div key={customer.id} className="rounded-2xl border p-4">
                  <p className="font-bold">{customer.name}</p>
                  <div className="mt-2 grid gap-2 text-sm md:grid-cols-3">
                    <p>Satış: {money(customer.sales)}</p>
                    <p>Ödeme: {money(customer.paid)}</p>
                    <p className="font-bold text-red-700">
                      Bakiye: {money(customer.balance)}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </Panel>
        </div>

        <div className="mt-6 grid gap-6 lg:grid-cols-2">
          <Panel title="Tedarikçi Ekle">
            <div className="flex gap-2">
              <input
                value={supplierName}
                onChange={(e) => setSupplierName(e.target.value)}
                placeholder="Tedarikçi adı"
                className="flex-1 rounded-xl border p-3"
              />
              <button
                onClick={addSupplier}
                className="rounded-xl bg-blue-700 px-6 py-3 font-bold text-white"
              >
                Ekle
              </button>
            </div>
          </Panel>

          <Panel title="Gider / Fatura Ekle">
            <div className="space-y-3">
              <select
                value={selectedSupplier}
                onChange={(e) => setSelectedSupplier(e.target.value)}
                className="w-full rounded-xl border p-3"
              >
                <option value="">Tedarikçi seç</option>
                {suppliers.map((supplier) => (
                  <option key={supplier.id} value={supplier.id}>
                    {supplier.name}
                  </option>
                ))}
              </select>

              <input
                value={invoiceDescription}
                onChange={(e) => setInvoiceDescription(e.target.value)}
                placeholder="Açıklama"
                className="w-full rounded-xl border p-3"
              />

              <input
                value={invoiceAmount}
                onChange={(e) => setInvoiceAmount(e.target.value)}
                placeholder="Tutar"
                type="number"
                className="w-full rounded-xl border p-3"
              />

              <button
                onClick={addSupplierInvoice}
                className="w-full rounded-xl bg-blue-700 px-6 py-3 font-bold text-white"
              >
                Fatura Kaydet
              </button>
            </div>
          </Panel>
        </div>

        <Panel title="Tedarikçi Borçları" className="mt-6">
          <div className="space-y-3">
            {supplierInvoices.length === 0 ? (
              <p className="text-slate-500">Henüz gider yok.</p>
            ) : (
              supplierInvoices.map((invoice) => (
                <div key={invoice.id} className="rounded-2xl border p-4">
                  <div className="flex justify-between gap-4">
                    <div>
                      <p className="font-bold">{invoice.suppliers?.name}</p>
                      <p className="text-sm text-slate-500">
                        {invoice.description || "Açıklama yok"}
                      </p>
                    </div>

                    <div className="text-right">
                      <p className="font-bold text-red-700">
                        {money(invoice.amount)}
                      </p>

                      {invoice.is_paid ? (
                        <p className="text-sm font-bold text-green-700">
                          Ödendi
                        </p>
                      ) : (
                        <button
                          onClick={() => markInvoicePaid(invoice.id)}
                          className="rounded-xl bg-green-700 px-4 py-2 text-sm font-bold text-white"
                        >
                          Ödendi İşaretle
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        </Panel>
      </div>
    </main>
  );
}

function Box({ title, value, red, dark }: any) {
  return (
    <div
      className={`rounded-3xl p-5 shadow ${
        dark ? "bg-red-800 text-white" : "bg-white"
      }`}
    >
      <p className={`text-sm ${dark ? "text-red-100" : "text-slate-500"}`}>
        {title}
      </p>
      <p className={`mt-2 text-2xl font-bold ${red ? "text-red-700" : ""}`}>
        {value}
      </p>
    </div>
  );
}

function Panel({ title, children, className = "" }: any) {
  return (
    <div className={`rounded-3xl bg-white p-6 shadow ${className}`}>
      <h2 className="mb-4 text-xl font-bold">{title}</h2>
      {children}
    </div>
  );
}