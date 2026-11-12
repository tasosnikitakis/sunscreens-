#!/usr/bin/env node
// scripts/exclude-frezyderm-boosters-promos.mjs — ΑΠΟΣΥΡΘΗΚΕ.
// Οι κανόνες (Boosters 5ml, promo, νεσεσέρ, δώρο δείγμα) ζουν πλέον στο
// js/frezyderm-exclusions.json και εφαρμόζονται αυτόματα από το
//   node scripts/build-brand-supplier.mjs --brand=frezyderm --xlsx=Frezyderm.xlsx
// (που εξαιρεί και τα js/frezyderm-discontinued.json).
console.error("Αποσύρθηκε: τρέξτε node scripts/build-brand-supplier.mjs --brand=frezyderm --xlsx=Frezyderm.xlsx");
process.exit(1);
