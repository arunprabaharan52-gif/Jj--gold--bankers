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
  const [loading, setLoading] = useState(true);
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
      setLoading(false);
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
    </div
