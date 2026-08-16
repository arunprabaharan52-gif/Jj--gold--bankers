"use client";

import { useEffect, useState } from "react";
import { isConfigured, supabase } from "../lib/supabase";

const money = (n) =>
  new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0,
  }).format(Number(n || 0));

const today = () => new Date().toISOString().slice(0, 10);

const monthsBetween = (start, end = new Date()) => {
  const a = new Date(start);
  const b = new Date(end);
  const days = Math.max(1, Math.ceil((b - a) / 86400000));
  return Math.max(1, Math.ceil(days / 30));
};

const emptyCustomer = {
  name: "",
  phone: "",
  alternate_phone: "",
  address: "",
  id_type: "Aadhaar",
  id_last4: "",
  notes: "",
};

const emptyPledge = {
  customer_id: "",
  purity: "22K",
  item_description: "",
  gross_weight: "",
  stone_weight: "0",
  principal: "",
  monthly_interest_rate: "2",
  pledge_date: today(),
  notes: "",
};

export default function HomePage() {
  const [session, setSession] = useState(null);
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(isConfigured);
  const [tab, setTab] = useState("dashboard");
  const [message, setMessage] = useState("");
  const [rates, setRates] = useState({
    rate_22k: 0,
    rate_18k: 0,
    effective_date: today(),
  });
  const [customers, setCustomers] = useState([]);
  const [pledges, setPledges] = useState([]);

  useEffect(() => {
    if (!supabase) {
      return;
    }

    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setLoading(false);
    });

    const { data: listener } = supabase.auth.onAuthStateChange((_event, currentSession) => {
      setSession(currentSession);
    });

    return () => listener.subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (session) loadAll();
  }, [session]);

  async function loadAll() {
    setLoading(true);

    const [profileResult, rateResult, customerResult, pledgeResult] =
      await Promise.all([
        supabase
          .from("profiles")
          .select("*")
          .eq("id", session.user.id)
          .single(),

        supabase
          .from("business_settings")
          .select("*")
          .eq("id", 1)
          .single(),

        supabase
          .from("customers")
          .select("*")
          .order("created_at", { ascending: false }),

        supabase
          .from("pledges")
          .select("*, customers(customer_no,name,phone)")
          .order("created_at", { ascending: false }),
      ]);

    setProfile(profileResult.data || null);

    if (rateResult.data) {
      setRates(rateResult.data);
    }

    setCustomers(customerResult.data || []);
    setPledges(pledgeResult.data || []);
    setLoading(false);
  }

  if (!isConfigured) {
    return <SetupNotice />;
  }

  if (loading) {
    return <div className="spin">தகவல்கள் ஏற்றப்படுகின்றன…</div>;
  }

  if (!session) {
    return <Login />;
  }

  if (!profile) {
    return (
      <div className="loginPage">
        <div className="loginCard">
          <h2>அணுகல் அனுமதி இல்லை</h2>

          <p>
            இந்த Login-க்கு profiles அட்டவணையில் Owner அல்லது Staff role
            சேர்க்க வேண்டும்.
          </p>

          <button
            className="btn"
            onClick={() => supabase.auth.signOut()}
          >
            வெளியேறு
          </button>
        </div>
      </div>
    );
  }

  const activePledges = pledges.filter(
    (pledge) => pledge.status === "active"
  );

  const totalPrincipal = activePledges.reduce(
    (total, pledge) => total + Number(pledge.principal),
    0
  );

  const showMessage = (text, type = "success") => {
    setMessage(`${type}|${text}`);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  return (
    <div className="shell">
      <header className="topbar">
        <div>
          <strong>JJ Gold Bankers</strong>

          <div className="role">
            {profile.full_name} · {profile.role}
          </div>
        </div>

        <div className="topActions">
          <button
            className="btn secondary small"
            onClick={() => supabase.auth.signOut()}
          >
            வெளியேறு
          </button>
        </div>
      </header>

      <nav className="nav">
        {[
          ["dashboard", "முகப்பு"],
          ["rates", "தினசரி ரேட்"],
          ["customers", "வாடிக்கையாளர்கள்"],
          ["pledges", "புதிய அடகு"],
          ["active", "நடப்பு அடகுகள்"],
          ["history", "வரலாறு"],
        ].map(([id, label]) => (
          <button
            key={id}
            className={tab === id ? "active" : ""}
            onClick={() => {
              setTab(id);
              setMessage("");
            }}
          >
            {label}
          </button>
        ))}
      </nav>

      <main className="content">
        {message && (
          <div
            className={`notice ${
              message.startsWith("error|") ? "error" : "success"
            }`}
          >
            {message.split("|")[1]}
          </div>
        )}

        {tab === "dashboard" && (
          <Dashboard
            customers={customers}
            active={activePledges}
            total={totalPrincipal}
            rates={rates}
          />
        )}

        {tab === "rates" && (
          <Rates
            rates={rates}
            setRates={setRates}
            owner={profile.role === "owner"}
            onSaved={() =>
              showMessage("இன்றைய ரேட் சேமிக்கப்பட்டது.")
            }
            onError={(error) => showMessage(error, "error")}
          />
        )}

        {tab === "customers" && (
          <Customers
            customers={customers}
            reload={loadAll}
            onSaved={(text) => showMessage(text)}
            onError={(error) => showMessage(error, "error")}
          />
        )}

        {tab === "pledges" && (
          <NewPledge
            customers={customers}
            rates={rates}
            reload={loadAll}
            onSaved={(text) => {
              showMessage(text);
              setTab("active");
            }}
            onError={(error) => showMessage(error, "error")}
          />
        )}

        {tab === "active" && (
          <PledgeTable
            rows={activePledges}
            canRedeem={true}
            reload={loadAll}
            onSaved={(text) => showMessage(text)}
            onError={(error) => showMessage(error, "error")}
          />
        )}

        {tab === "history" && (
          <PledgeTable
            rows={pledges}
            canRedeem={false}
            reload={loadAll}
            onSaved={(text) => showMessage(text)}
            onError={(error) => showMessage(error, "error")}
          />
        )}
      </main>
    </div>
  );
}

function SetupNotice() {
  return (
    <div className="loginPage">
      <div className="loginCard">
        <h1 className="brand">JJ Gold Bankers</h1>

        <div className="notice error">
          Supabase அமைப்பு இன்னும் இணைக்கப்படவில்லை.
        </div>

        <p>
          Vercel Environment Variables-ல் Supabase URL மற்றும் Key சேர்க்க
          வேண்டும்.
        </p>
      </div>
    </div>
  );
}

function Login() {
  const [mode, setMode] = useState("login");
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [info, setInfo] = useState("");

  async function submit(event) {
    event.preventDefault();
    setError("");
    setInfo("");

    if (!email.trim() || password.length < 6) {
      setError("சரியான Email மற்றும் குறைந்தது 6 எழுத்துகள் கொண்ட Password கொடுக்கவும்.");
      return;
    }

    setBusy(true);

    try {
      if (mode === "signup") {
        const { data, error: signUpError } = await supabase.auth.signUp({
          email: email.trim(),
          password,
          options: {
            data: {
              full_name: fullName.trim() || email.split("@")[0],
            },
          },
        });

        if (signUpError) throw signUpError;

        if (!data.session) {
          setInfo("Account உருவாக்கப்பட்டது. உங்கள் Email-ல் வந்த confirmation link-ஐ அழுத்தி, பிறகு Login செய்யவும்.");
          setMode("login");
        }
      } else {
        const { error: signInError } = await supabase.auth.signInWithPassword({
          email: email.trim(),
          password,
        });

        if (signInError) throw signInError;
      }
    } catch (submitError) {
      setError(submitError.message || "Login செய்ய முடியவில்லை.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="loginPage">
      <form className="loginCard" onSubmit={submit}>
        <div className="logoMark">★</div>
        <h1 className="brand">JJ GOLD BANKERS</h1>
        <p className="muted">Gold Pledge Management</p>

        {error && <div className="notice error">{error}</div>}
        {info && <div className="notice success">{info}</div>}

        {mode === "signup" && (
          <label className="field">
            <span>பெயர்</span>
            <input
              value={fullName}
              onChange={(event) => setFullName(event.target.value)}
              placeholder="உங்கள் பெயர்"
              autoComplete="name"
            />
          </label>
        )}

        <label className="field">
          <span>Email</span>
          <input
            type="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            placeholder="name@example.com"
            autoComplete="email"
          />
        </label>

        <label className="field">
          <span>Password</span>
          <input
            type="password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            placeholder="குறைந்தது 6 எழுத்துகள்"
            autoComplete={mode === "signup" ? "new-password" : "current-password"}
          />
        </label>

        <button className="btn full" disabled={busy}>
          {busy ? "தயவுசெய்து காத்திருக்கவும்…" : mode === "signup" ? "Account உருவாக்கு" : "Login"}
        </button>

        <button
          className="linkButton"
          type="button"
          onClick={() => {
            setMode(mode === "login" ? "signup" : "login");
            setError("");
            setInfo("");
          }}
        >
          {mode === "login" ? "புதிய Account உருவாக்க" : "ஏற்கனவே Account உள்ளதா? Login"}
        </button>
      </form>
    </div>
  );
}

function Dashboard({ customers, active, total, rates }) {
  const totalWeight = active.reduce(
    (sum, pledge) => sum + Number(pledge.net_weight || 0),
    0
  );

  return (
    <>
      <section className="hero">
        <div>
          <p className="eyebrow">இன்றைய நிலவரம்</p>
          <h1>வணக்கம்!</h1>
          <p>உங்கள் அடகு வணிகத்தின் முக்கிய விவரங்கள்.</p>
        </div>
        <div className="ratePill">
          <span>22K ரேட்</span>
          <strong>{money(rates.rate_22k)}/g</strong>
        </div>
      </section>

      <section className="statsGrid">
        <StatCard label="மொத்த வாடிக்கையாளர்கள்" value={customers.length} tone="blue" />
        <StatCard label="நடப்பு அடகுகள்" value={active.length} tone="green" />
        <StatCard label="கொடுத்த கடன்" value={money(total)} tone="gold" />
        <StatCard label="நடப்பு நிகர எடை" value={`${totalWeight.toFixed(3)} g`} tone="red" />
      </section>

      <section className="panel">
        <div className="panelHead">
          <div>
            <h2>சமீபத்திய நடப்பு அடகுகள்</h2>
            <p>கடைசியாக சேர்க்கப்பட்ட 5 பதிவுகள்</p>
          </div>
        </div>

        {active.length === 0 ? (
          <EmptyState text="இன்னும் நடப்பு அடகுகள் இல்லை." />
        ) : (
          <div className="tableWrap">
            <table>
              <thead>
                <tr>
                  <th>அடகு எண்</th>
                  <th>வாடிக்கையாளர்</th>
                  <th>பொருள்</th>
                  <th>கடன்</th>
                </tr>
              </thead>
              <tbody>
                {active.slice(0, 5).map((pledge) => (
                  <tr key={pledge.id}>
                    <td className="strong">{pledge.pledge_no}</td>
                    <td>{pledge.customers?.name || "-"}</td>
                    <td>{pledge.item_description}</td>
                    <td>{money(pledge.principal)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </>
  );
}

function StatCard({ label, value, tone }) {
  return (
    <article className={`statCard ${tone}`}>
      <span>{label}</span>
      <strong>{value}</strong>
    </article>
  );
}

function Rates({ rates, setRates, owner, onSaved, onError }) {
  const [saving, setSaving] = useState(false);

  async function saveRates(event) {
    event.preventDefault();

    if (!owner) {
      onError("தினசரி ரேட்டை Owner மட்டுமே மாற்ற முடியும்.");
      return;
    }

    if (Number(rates.rate_22k) <= 0 || Number(rates.rate_18k) <= 0) {
      onError("22K மற்றும் 18K ரேட்டை சரியாக கொடுக்கவும்.");
      return;
    }

    setSaving(true);

    const { error } = await supabase.from("business_settings").upsert({
      id: 1,
      rate_22k: Number(rates.rate_22k),
      rate_18k: Number(rates.rate_18k),
      effective_date: rates.effective_date || today(),
      updated_at: new Date().toISOString(),
    });

    setSaving(false);

    if (error) {
      onError(error.message);
      return;
    }

    onSaved();
  }

  return (
    <section className="panel narrowPanel">
      <div className="panelHead">
        <div>
          <h2>தினசரி தங்க ரேட்</h2>
          <p>ஒரு கிராமுக்கான விலையை பதிவு செய்யவும்.</p>
        </div>
      </div>

      {!owner && (
        <div className="notice">நீங்கள் Staff account-ல் உள்ளீர்கள். ரேட்டை பார்க்க மட்டும் முடியும்.</div>
      )}

      <form className="formGrid" onSubmit={saveRates}>
        <label className="field">
          <span>22K (916) ரேட் / gram</span>
          <input
            type="number"
            min="1"
            value={rates.rate_22k}
            disabled={!owner}
            onChange={(event) => setRates({ ...rates, rate_22k: event.target.value })}
          />
        </label>

        <label className="field">
          <span>18K ரேட் / gram</span>
          <input
            type="number"
            min="1"
            value={rates.rate_18k}
            disabled={!owner}
            onChange={(event) => setRates({ ...rates, rate_18k: event.target.value })}
          />
        </label>

        <label className="field">
          <span>தேதி</span>
          <input
            type="date"
            value={rates.effective_date || today()}
            disabled={!owner}
            onChange={(event) => setRates({ ...rates, effective_date: event.target.value })}
          />
        </label>

        {owner && (
          <div className="formActions">
            <button className="btn" disabled={saving}>
              {saving ? "சேமிக்கப்படுகிறது…" : "ரேட்டை சேமி"}
            </button>
          </div>
        )}
      </form>
    </section>
  );
}

function Customers({ customers, reload, onSaved, onError }) {
  const [form, setForm] = useState(emptyCustomer);
  const [saving, setSaving] = useState(false);
  const [search, setSearch] = useState("");

  const visibleCustomers = customers.filter((customer) => {
    const key = search.trim().toLowerCase();
    if (!key) return true;

    return [customer.customer_no, customer.name, customer.phone]
      .join(" ")
      .toLowerCase()
      .includes(key);
  });

  function update(name, value) {
    setForm((current) => ({ ...current, [name]: value }));
  }

  async function saveCustomer(event) {
    event.preventDefault();

    if (!form.name.trim() || !form.phone.trim()) {
      onError("வாடிக்கையாளர் பெயர் மற்றும் Phone அவசியம்.");
      return;
    }

    setSaving(true);

    const { data: userData } = await supabase.auth.getUser();
    const customerNo = `CUS-${new Date().getFullYear()}-${String(customers.length + 1).padStart(4, "0")}`;

    const { error } = await supabase.from("customers").insert({
      customer_no: customerNo,
      name: form.name.trim(),
      phone: form.phone.trim(),
      alternate_phone: form.alternate_phone.trim() || null,
      address: form.address.trim() || null,
      id_type: form.id_type,
      id_last4: form.id_last4.trim() || null,
      notes: form.notes.trim() || null,
      created_by: userData.user?.id || null,
    });

    setSaving(false);

    if (error) {
      onError(error.message);
      return;
    }

    setForm(emptyCustomer);
    await reload();
    onSaved(`${customerNo} வாடிக்கையாளர் பதிவு செய்யப்பட்டது.`);
  }

  return (
    <div className="splitLayout">
      <section className="panel">
        <div className="panelHead">
          <div>
            <h2>புதிய வாடிக்கையாளர்</h2>
            <p>அடிப்படை விவரங்களை பதிவு செய்யவும்.</p>
          </div>
        </div>

        <form className="formGrid" onSubmit={saveCustomer}>
          <label className="field">
            <span>பெயர் *</span>
            <input value={form.name} onChange={(event) => update("name", event.target.value)} />
          </label>

          <label className="field">
            <span>Phone *</span>
            <input
              type="tel"
              inputMode="numeric"
              value={form.phone}
              onChange={(event) => update("phone", event.target.value)}
            />
          </label>

          <label className="field">
            <span>மாற்று Phone</span>
            <input
              type="tel"
              inputMode="numeric"
              value={form.alternate_phone}
              onChange={(event) => update("alternate_phone", event.target.value)}
            />
          </label>

          <label className="field fieldWide">
            <span>முகவரி</span>
            <textarea value={form.address} onChange={(event) => update("address", event.target.value)} />
          </label>

          <label className="field">
            <span>ID வகை</span>
            <select value={form.id_type} onChange={(event) => update("id_type", event.target.value)}>
              <option>Aadhaar</option>
              <option>PAN</option>
              <option>Voter ID</option>
              <option>Driving Licence</option>
              <option>Other</option>
            </select>
          </label>

          <label className="field">
            <span>ID கடைசி 4 எண்கள்</span>
            <input
              maxLength="4"
              value={form.id_last4}
              onChange={(event) => update("id_last4", event.target.value)}
            />
          </label>

          <label className="field fieldWide">
            <span>குறிப்புகள்</span>
            <textarea value={form.notes} onChange={(event) => update("notes", event.target.value)} />
          </label>

          <div className="formActions fieldWide">
            <button className="btn" disabled={saving}>
              {saving ? "சேமிக்கப்படுகிறது…" : "வாடிக்கையாளரை சேமி"}
            </button>
          </div>
        </form>
      </section>

      <section className="panel">
        <div className="panelHead searchHead">
          <div>
            <h2>வாடிக்கையாளர்கள்</h2>
            <p>{customers.length} பதிவுகள்</p>
          </div>
          <input
            className="searchInput"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="பெயர் / Phone தேடவும்"
          />
        </div>

        {visibleCustomers.length === 0 ? (
          <EmptyState text="வாடிக்கையாளர் பதிவுகள் இல்லை." />
        ) : (
          <div className="customerCards">
            {visibleCustomers.map((customer) => (
              <article className="customerCard" key={customer.id}>
                <div className="avatar">{customer.name.slice(0, 1).toUpperCase()}</div>
                <div>
                  <strong>{customer.name}</strong>
                  <span>{customer.customer_no}</span>
                  <a href={`tel:${customer.phone}`}>{customer.phone}</a>
                </div>
              </article>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

function NewPledge({ customers, rates, reload, onSaved, onError }) {
  const [form, setForm] = useState(emptyPledge);
  const [saving, setSaving] = useState(false);

  function update(name, value) {
    setForm((current) => ({ ...current, [name]: value }));
  }

  const gross = Number(form.gross_weight || 0);
  const stone = Number(form.stone_weight || 0);
  const netWeight = Math.max(0, gross - stone);
  const goldRate = form.purity === "18K" ? Number(rates.rate_18k || 0) : Number(rates.rate_22k || 0);
  const estimatedValue = netWeight * goldRate;
  const loanPercent = estimatedValue > 0 ? (Number(form.principal || 0) / estimatedValue) * 100 : 0;

  async function savePledge(event) {
    event.preventDefault();

    if (!form.customer_id || !form.item_description.trim()) {
      onError("வாடிக்கையாளர் மற்றும் அடகு பொருள் அவசியம்.");
      return;
    }

    if (netWeight <= 0 || Number(form.principal) <= 0) {
      onError("எடை மற்றும் கடன் தொகையை சரியாக கொடுக்கவும்.");
      return;
    }

    if (goldRate <= 0) {
      onError("முதலில் தினசரி தங்க ரேட்டை பதிவு செய்யவும்.");
      return;
    }

    setSaving(true);

    const [{ count, error: countError }, { data: userData }] = await Promise.all([
      supabase.from("pledges").select("*", { count: "exact", head: true }),
      supabase.auth.getUser(),
    ]);

    if (countError) {
      setSaving(false);
      onError(countError.message);
      return;
    }

    const pledgeNo = `JJG-${new Date().getFullYear()}-${String((count || 0) + 1).padStart(5, "0")}`;
    const due = new Date(`${form.pledge_date}T00:00:00`);
    due.setFullYear(due.getFullYear() + 1);

    const { error } = await supabase.from("pledges").insert({
      pledge_no: pledgeNo,
      customer_id: form.customer_id,
      purity: form.purity,
      item_description: form.item_description.trim(),
      gross_weight: gross,
      stone_weight: stone,
      net_weight: netWeight,
      gold_rate: goldRate,
      estimated_value: estimatedValue,
      principal: Number(form.principal),
      balance: Number(form.principal),
      monthly_interest_rate: Number(form.monthly_interest_rate),
      pledge_date: form.pledge_date,
      due_date: due.toISOString().slice(0, 10),
      status: "active",
      notes: form.notes.trim() || null,
      created_by: userData.user?.id || null,
    });

    setSaving(false);

    if (error) {
      onError(error.message);
      return;
    }

    setForm(emptyPledge);
    await reload();
    onSaved(`${pledgeNo} அடகு பதிவு செய்யப்பட்டது.`);
  }

  return (
    <section className="panel">
      <div className="panelHead">
        <div>
          <h2>புதிய அடகு</h2>
          <p>நகை விவரம், எடை மற்றும் கடன் தொகையை பதிவு செய்யவும்.</p>
        </div>
      </div>

      {customers.length === 0 && (
        <div className="notice">முதலில் “வாடிக்கையாளர்கள்” பகுதியில் வாடிக்கையாளரை சேர்க்கவும்.</div>
      )}

      <form className="formGrid threeColumns" onSubmit={savePledge}>
        <label className="field fieldWideOnMobile">
          <span>வாடிக்கையாளர் *</span>
          <select value={form.customer_id} onChange={(event) => update("customer_id", event.target.value)}>
            <option value="">தேர்வு செய்யவும்</option>
            {customers.map((customer) => (
              <option value={customer.id} key={customer.id}>
                {customer.customer_no} - {customer.name} - {customer.phone}
              </option>
            ))}
          </select>
        </label>

        <label className="field">
          <span>தூய்மை</span>
          <select value={form.purity} onChange={(event) => update("purity", event.target.value)}>
            <option>22K</option>
            <option>18K</option>
          </select>
        </label>

        <label className="field">
          <span>அடகு தேதி</span>
          <input
            type="date"
            value={form.pledge_date}
            onChange={(event) => update("pledge_date", event.target.value)}
          />
        </label>

        <label className="field fieldWideOnMobile">
          <span>நகை / பொருள் விவரம் *</span>
          <input
            value={form.item_description}
            onChange={(event) => update("item_description", event.target.value)}
            placeholder="உதா: தங்க செயின்"
          />
        </label>

        <label className="field">
          <span>மொத்த எடை (g)</span>
          <input
            type="number"
            min="0"
            step="0.001"
            value={form.gross_weight}
            onChange={(event) => update("gross_weight", event.target.value)}
          />
        </label>

        <label className="field">
          <span>கல் எடை (g)</span>
          <input
            type="number"
            min="0"
            step="0.001"
            value={form.stone_weight}
            onChange={(event) => update("stone_weight", event.target.value)}
          />
        </label>

        <label className="field">
          <span>கடன் தொகை ₹</span>
          <input
            type="number"
            min="1"
            value={form.principal}
            onChange={(event) => update("principal", event.target.value)}
          />
        </label>

        <label className="field">
          <span>மாத வட்டி %</span>
          <input
            type="number"
            min="0"
            step="0.01"
            value={form.monthly_interest_rate}
            onChange={(event) => update("monthly_interest_rate", event.target.value)}
          />
        </label>

        <label className="field fieldWideOnMobile">
          <span>குறிப்புகள்</span>
          <input value={form.notes} onChange={(event) => update("notes", event.target.value)} />
        </label>

        <div className="valuation fieldFull">
          <div><span>நிகர எடை</span><strong>{netWeight.toFixed(3)} g</strong></div>
          <div><span>தங்க ரேட்</span><strong>{money(goldRate)}</strong></div>
          <div><span>மதிப்பீடு</span><strong>{money(estimatedValue)}</strong></div>
          <div><span>கடன் சதவீதம்</span><strong>{loanPercent.toFixed(1)}%</strong></div>
        </div>

        <div className="formActions fieldFull">
          <button className="btn" disabled={saving || customers.length === 0}>
            {saving ? "சேமிக்கப்படுகிறது…" : "அடகை சேமி"}
          </button>
        </div>
      </form>
    </section>
  );
}

function PledgeTable({ rows, canRedeem, reload, onSaved, onError }) {
  const [search, setSearch] = useState("");
  const [closingId, setClosingId] = useState(null);

  const visibleRows = rows.filter((pledge) => {
    const key = search.trim().toLowerCase();
    if (!key) return true;

    return [
      pledge.pledge_no,
      pledge.customers?.name,
      pledge.customers?.phone,
      pledge.item_description,
    ]
      .join(" ")
      .toLowerCase()
      .includes(key);
  });

  async function redeem(pledge) {
    const months = monthsBetween(pledge.pledge_date);
    const interest = Number(pledge.principal) * (Number(pledge.monthly_interest_rate) / 100) * months;
    const totalDue = Number(pledge.principal) + interest;

    if (!window.confirm(`${pledge.pledge_no} அடகை மீட்கப்பட்டதாக பதிவு செய்யவா? மொத்த கணக்கு: ${money(totalDue)}`)) {
      return;
    }

    setClosingId(pledge.id);

    const { error } = await supabase
      .from("pledges")
      .update({
        status: "redeemed",
        balance: 0,
        redeemed_at: new Date().toISOString(),
      })
      .eq("id", pledge.id);

    setClosingId(null);

    if (error) {
      onError(error.message);
      return;
    }

    await reload();
    onSaved(`${pledge.pledge_no} மீட்பு பதிவு செய்யப்பட்டது.`);
  }

  return (
    <section className="panel">
      <div className="panelHead searchHead">
        <div>
          <h2>{canRedeem ? "நடப்பு அடகுகள்" : "முழு அடகு வரலாறு"}</h2>
          <p>{rows.length} பதிவுகள்</p>
        </div>
        <input
          className="searchInput"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder="எண் / பெயர் / Phone தேடவும்"
        />
      </div>

      {visibleRows.length === 0 ? (
        <EmptyState text="அடகு பதிவுகள் இல்லை." />
      ) : (
        <div className="tableWrap">
          <table>
            <thead>
              <tr>
                <th>அடகு எண்</th>
                <th>வாடிக்கையாளர்</th>
                <th>பொருள் / எடை</th>
                <th>தேதி</th>
                <th>கடன்</th>
                <th>வட்டி கணக்கு</th>
                <th>நிலை</th>
                {canRedeem && <th>செயல்</th>}
              </tr>
            </thead>
            <tbody>
              {visibleRows.map((pledge) => {
                const months = monthsBetween(pledge.pledge_date, pledge.redeemed_at ? new Date(pledge.redeemed_at) : new Date());
                const interest = Number(pledge.principal) * (Number(pledge.monthly_interest_rate) / 100) * months;

                return (
                  <tr key={pledge.id}>
                    <td className="strong">{pledge.pledge_no}</td>
                    <td>
                      <strong>{pledge.customers?.name || "-"}</strong>
                      <small>{pledge.customers?.phone || ""}</small>
                    </td>
                    <td>
                      {pledge.item_description}
                      <small>{Number(pledge.net_weight || 0).toFixed(3)} g · {pledge.purity}</small>
                    </td>
                    <td>{pledge.pledge_date}</td>
                    <td>{money(pledge.principal)}</td>
                    <td>
                      {money(interest)}
                      <small>{months} மாதம் · {pledge.monthly_interest_rate}%</small>
                    </td>
                    <td>
                      <span className={`status ${pledge.status}`}>{pledge.status === "active" ? "நடப்பு" : "மீட்கப்பட்டது"}</span>
                    </td>
                    {canRedeem && (
                      <td>
                        <button
                          className="btn small"
                          disabled={closingId === pledge.id}
                          onClick={() => redeem(pledge)}
                        >
                          {closingId === pledge.id ? "…" : "மீட்பு"}
                        </button>
                      </td>
                    )}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

function EmptyState({ text }) {
  return (
    <div className="emptyState">
      <div>◇</div>
      <p>{text}</p>
    </div>
  );
}
