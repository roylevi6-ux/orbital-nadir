# SMS Samples (Isracard)

## Format 1: Standard Hebrew
`שלום, בכרטיסך 8770 אושרה עסקה ב-29/01 בסך 143.42 ש"ח במנורה מבטחים - חיים.`

## Format 2: "Ending in" variation
`שלום, בכרטיסך המסתיים ב- 8770, אושרה עסקה ב- 29/01 בסך 78.00 ש"ח בציקן סטיישן מידטאון.`

## Format 3: ILS Currency & English Merchant
`שלום, בכרטיסך 8770 אושרה עסקה ב- 29/01 בסך 49.90 ILS ב-.APPLE.COM BILL - IRELAND`

## Format 4: BIT Transfer
`שלום, בכרטיסך 8770 אושרה עסקה ב- 29/01 בסך 1100.00 ש"ח בהעברה ב BIT בנה"פ.`

## Key Patterns
- **Trigger words:** "אושרה עסקה" (Transaction approved)
- **Card:** "בכרטיסך XXXX" or "בכרטיסך המסתיים ב- XXXX"
- **Date:** DD/MM (Current year implied)
- **Amount:** "בסך X.XX ש"ח" or "בסך X.XX ILS"
- **Merchant:** "ב[Merchant Name]" or "ב-[Merchant Name]" (Hebrew prefix 'bet')
