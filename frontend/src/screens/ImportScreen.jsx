import { useCallback, useState } from "react";
import { useDropzone } from "react-dropzone";
import Papa from "papaparse";
import { Upload, Database, AlertCircle, CheckCircle2, ArrowRight } from "lucide-react";
import { Button } from "../components/ui/button";
import { useApp } from "../context/AppContext";
import { categoryLabel } from "../lib/utils";

const SAMPLE_LEADS = [
  { name: "Rustic Scruff Grooming", email: "rusticscruffgrooming@gmail.com", city: "Coal City, IL", category: "pet_groomer", phone: "+1 815-518-5153", facebook_url: "https://m.facebook.com/RusticScruffGrooming/", review_score: 4.9 },
  { name: "JBS Towing and Recovery", email: "laurag@jbscustoms.com", city: "Chaparral, NM", category: "towing_service", phone: "+1 575-386-0170", facebook_url: "https://www.facebook.com/JBSTowingandRecovery/", review_score: 4.7 },
  { name: "B & H Soul Kreationz", email: "bhsoulkreationz@gmail.com", city: "Dunnellon, FL", category: "restaurant", phone: "+1 352-229-0751", facebook_url: "https://www.facebook.com/bhsoulkreationz/", review_score: 4.9 },
  { name: "Verde Valley Dental", email: "contact@verdevalleydental.com", city: "Cottonwood, AZ", category: "dental_clinic", phone: "+1 928-634-5558", facebook_url: "", review_score: 4.8 },
  { name: "Mesa Tire & Auto", email: "mesatire@gmail.com", city: "Mesa, AZ", category: "auto_repair_shop", phone: "+1 480-830-2211", facebook_url: "https://www.facebook.com/MesaTireAuto/", review_score: 4.6 },
];

function normalizeRow(row) {
  const r = {};
  // unnamed first column (empty header) → treat as business name
  const firstVal = Object.entries(row)[0];
  const unnamedName = (!firstVal[0].trim()) ? (firstVal[1] || "").trim() : "";
  for (const [k, v] of Object.entries(row)) {
    r[k.trim().toLowerCase().replace(/\s+/g, "_")] = (v || "").trim();
  }
  // city + state/zip may be split across city and country columns
  const cityPart = r.city || r.location || "";
  const statePart = r.country || r.state || "";
  const cityFull = cityPart && statePart ? `${cityPart}, ${statePart}` : cityPart || statePart;
  return {
    name: r.name || r.business_name || unnamedName || "",
    email: r.email || r.emails || r.email_address || "",
    city: cityFull,
    category: r.business_category || r.category || r.type || "",
    phone: r.phone || r.phone_number || r.contact || "",
    facebook_url: r.facebook || r.facebook_url || r.fb || "",
    review_score: parseFloat(r.review_score || r.rating || r.stars) || null,
  };
}

export default function ImportScreen() {
  const { setRawLeads, setScreen } = useApp();
  const [parsed, setParsed] = useState([]);

  const processFile = (file) => {
    Papa.parse(file, {
      header: true,
      skipEmptyLines: true,
      complete: (results) => {
        const rows = results.data.map(normalizeRow).filter((r) => r.name);
        setParsed(rows);
      },
    });
  };

  const onDrop = useCallback((files) => {
    if (files[0]) processFile(files[0]);
  }, []);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: { "text/csv": [".csv"] },
    multiple: false,
  });

  const loadSample = () => setParsed(SAMPLE_LEADS);
  const missingEmail = parsed.filter((r) => !r.email);

  const handleConfirm = () => {
    setRawLeads(parsed);
    setScreen("configure");
  };

  return (
    <div className="animate-fade-in">
      <div className="mb-8">
        <h1 className="text-3xl font-bold tracking-tight text-gray-900">Import Leads</h1>
        <p className="text-gray-500 mt-2 text-sm">
          Upload your CSV of businesses without websites. We handle the rest.
        </p>
      </div>

      <div className="grid gap-6 grid-cols-1 lg:grid-cols-[1fr_280px]">
        <div className="space-y-4">
          {/* Drop zone */}
          <div
            {...getRootProps()}
            className={`
              border-2 border-dashed rounded-2xl p-8 sm:p-16 text-center cursor-pointer transition-all duration-200
              ${isDragActive
                ? "border-primary bg-primary-light"
                : "border-gray-200 bg-white hover:border-primary hover:bg-[#EEEDFE]/30"
              }
            `}
          >
            <input {...getInputProps()} />
            <div className="w-14 h-14 bg-primary-light rounded-xl flex items-center justify-center mx-auto mb-4">
              <Upload size={28} className="text-primary" />
            </div>
            <p className="font-semibold text-gray-800 mb-1">
              {isDragActive ? "Drop it here!" : "Drop your CSV here"}
            </p>
            <p className="text-gray-400 text-sm">
              or click to browse · name, email, city, category required
            </p>
          </div>

          {/* Divider */}
          <div className="flex items-center gap-4">
            <div className="flex-1 h-px bg-gray-200" />
            <span className="text-gray-400 text-xs">or</span>
            <div className="flex-1 h-px bg-gray-200" />
          </div>

          {/* Sample button */}
          <Button
            variant="outline"
            className="w-full py-3 gap-2"
            onClick={loadSample}
          >
            <Database size={15} />
            Load 5 sample leads for testing
          </Button>

          {/* Preview table */}
          {parsed.length > 0 && (
            <div className="bg-white rounded-xl border border-gray-200 overflow-hidden animate-fade-in">
              <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100">
                <div className="flex items-center gap-3">
                  <span className="font-semibold text-sm">{parsed.length} leads imported</span>
                  {missingEmail.length > 0 ? (
                    <span className="flex items-center gap-1 text-xs text-red-600 bg-red-50 px-2 py-0.5 rounded-full">
                      <AlertCircle size={11} />
                      {missingEmail.length} missing email
                    </span>
                  ) : (
                    <span className="flex items-center gap-1 text-xs text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded-full">
                      <CheckCircle2 size={11} />
                      All emails valid
                    </span>
                  )}
                </div>
                <Button
                  onClick={handleConfirm}
                  className="bg-primary hover:bg-primary-dark gap-2 text-sm"
                >
                  Confirm & Continue <ArrowRight size={14} />
                </Button>
              </div>
              <div className="overflow-x-auto max-h-72 overflow-y-auto">
                <table className="w-full text-xs">
                  <thead className="bg-gray-50 sticky top-0">
                    <tr>
                      {["Name", "Email", "City", "Category", "Phone", "Rating"].map((h) => (
                        <th key={h} className="text-left px-4 py-2 text-gray-500 font-medium">
                          {h}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {parsed.slice(0, 10).map((row, i) => (
                      <tr
                        key={i}
                        className={`border-t border-gray-50 ${!row.email ? "bg-red-50" : ""}`}
                      >
                        <td className="px-4 py-2 font-medium text-gray-800">{row.name}</td>
                        <td className={`px-4 py-2 ${!row.email ? "text-red-500" : "text-gray-600"}`}>
                          {row.email || "⚠ missing"}
                        </td>
                        <td className="px-4 py-2 text-gray-500">{row.city}</td>
                        <td className="px-4 py-2 text-gray-500">{categoryLabel(row.category)}</td>
                        <td className="px-4 py-2 text-gray-400">{row.phone}</td>
                        <td className="px-4 py-2 text-gray-500">{row.review_score || "—"}</td>
                      </tr>
                    ))}
                    {parsed.length > 10 && (
                      <tr className="border-t border-gray-100">
                        <td colSpan={6} className="px-4 py-2 text-center text-gray-400 text-xs">
                          + {parsed.length - 10} more rows
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>

        {/* Column guide */}
        <div className="bg-white border border-gray-200 rounded-xl p-5 h-fit">
          <p className="font-semibold text-sm mb-4">Expected CSV columns</p>
          {[
            ["name / business_name", "Business name", true],
            ["email / emails", "Contact email", true],
            ["city", "City + state", true],
            ["business_category", "Type of business", true],
            ["phone_number", "Phone", false],
            ["facebook", "Facebook URL", false],
            ["review_score", "Google rating", false],
          ].map(([col, desc, req]) => (
            <div
              key={col}
              className="flex justify-between items-center py-2 border-b border-gray-50 text-xs last:border-0"
            >
              <span className="font-mono text-primary">{col}</span>
              <span className={req ? "text-gray-500" : "text-gray-300"}>
                {desc} {req ? "✦" : ""}
              </span>
            </div>
          ))}
          <p className="text-[10px] text-gray-300 mt-3">✦ Required fields</p>
        </div>
      </div>
    </div>
  );
}
