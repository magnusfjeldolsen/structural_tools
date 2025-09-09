/**
 * EC8 Seismic Avoidance Criteria Calculator - Main Script
 * Based on Eurocode 8 (EN 1998-1) standards
 */

// Utility functions
function toFixedIfNeeded(num, digits = 2) {
    return parseFloat(num.toFixed(digits));
}

// Norway seismic data embedded directly in JavaScript
const norwaySeismicData = [
    {fylke: "Viken", kommune: "Aremark", nr: "3012", agR: 0.20},
    {fylke: "Viken", kommune: "Asker", nr: "3025", agR: 0.25},
    {fylke: "Viken", kommune: "Aurskog-Høland", nr: "3026", agR: 0.20},
    {fylke: "Viken", kommune: "Bærum", nr: "3024", agR: 0.25},
    {fylke: "Viken", kommune: "Drammen", nr: "3005", agR: 0.25},
    {fylke: "Viken", kommune: "Eidsvoll", nr: "3033", agR: 0.20},
    {fylke: "Viken", kommune: "Enebakk", nr: "3028", agR: 0.25},
    {fylke: "Viken", kommune: "Flesberg", nr: "3050", agR: 0.20},
    {fylke: "Viken", kommune: "Fredrikstad", nr: "3004", agR: 0.20},
    {fylke: "Viken", kommune: "Frogn", nr: "3022", agR: 0.25},
    {fylke: "Viken", kommune: "Gjerdrum", nr: "3032", agR: 0.20},
    {fylke: "Viken", kommune: "Gol", nr: "3041", agR: 0.20},
    {fylke: "Viken", kommune: "Halden", nr: "3001", agR: 0.20},
    {fylke: "Viken", kommune: "Hemsedal", nr: "3042", agR: 0.20},
    {fylke: "Viken", kommune: "Hol", nr: "3044", agR: 0.25},
    {fylke: "Viken", kommune: "Hole", nr: "3038", agR: 0.25},
    {fylke: "Viken", kommune: "Hurdal", nr: "3037", agR: 0.20},
    {fylke: "Viken", kommune: "Hvaler", nr: "3011", agR: 0.20},
    {fylke: "Viken", kommune: "Indre Østfold", nr: "3014", agR: 0.20},
    {fylke: "Viken", kommune: "Jevnaker", nr: "3053", agR: 0.20},
    {fylke: "Viken", kommune: "Kongsberg", nr: "3006", agR: 0.20},
    {fylke: "Viken", kommune: "Krødsherad", nr: "3046", agR: 0.20},
    {fylke: "Viken", kommune: "Lier", nr: "3049", agR: 0.20},
    {fylke: "Viken", kommune: "Lillestrøm", nr: "3030", agR: 0.25},
    {fylke: "Viken", kommune: "Lunner", nr: "3054", agR: 0.20},
    {fylke: "Viken", kommune: "Lørenskog", nr: "3029", agR: 0.25},
    {fylke: "Viken", kommune: "Marker", nr: "3013", agR: 0.20},
    {fylke: "Viken", kommune: "Modum", nr: "3047", agR: 0.20},
    {fylke: "Viken", kommune: "Moss", nr: "3002", agR: 0.25},
    {fylke: "Viken", kommune: "Nannestad", nr: "3036", agR: 0.20},
    {fylke: "Viken", kommune: "Nes", nr: "3034", agR: 0.20},
    {fylke: "Viken", kommune: "Nesbyen", nr: "3040", agR: 0.20},
    {fylke: "Viken", kommune: "Nesodden", nr: "3023", agR: 0.25},
    {fylke: "Viken", kommune: "Nittedal", nr: "3031", agR: 0.25},
    {fylke: "Viken", kommune: "Nordre Follo", nr: "3020", agR: 0.25},
    {fylke: "Viken", kommune: "Nore og Uvdal", nr: "3052", agR: 0.25},
    {fylke: "Viken", kommune: "Rakkestad", nr: "3016", agR: 0.20},
    {fylke: "Viken", kommune: "Ringerike", nr: "3007", agR: 0.20},
    {fylke: "Viken", kommune: "Rollag", nr: "3051", agR: 0.20},
    {fylke: "Viken", kommune: "Rælingen", nr: "3027", agR: 0.25},
    {fylke: "Viken", kommune: "Råde", nr: "3017", agR: 0.20},
    {fylke: "Viken", kommune: "Sarpsborg", nr: "3003", agR: 0.20},
    {fylke: "Viken", kommune: "Sigdal", nr: "3045", agR: 0.20},
    {fylke: "Viken", kommune: "Skiptvet", nr: "3015", agR: 0.20},
    {fylke: "Viken", kommune: "Ullensaker", nr: "3033", agR: 0.20},
    {fylke: "Viken", kommune: "Vestby", nr: "3019", agR: 0.25},
    {fylke: "Viken", kommune: "Våler", nr: "3018", agR: 0.20},
    {fylke: "Viken", kommune: "Øvre Eiker", nr: "3048", agR: 0.20},
    {fylke: "Viken", kommune: "Ål", nr: "3043", agR: 0.20},
    {fylke: "Viken", kommune: "Ås", nr: "3021", agR: 0.25},
    {fylke: "Oslo", kommune: "Oslo", nr: "301", agR: 0.25},
    {fylke: "Innlandet", kommune: "Alvdal", nr: "3428", agR: 0.20},
    {fylke: "Innlandet", kommune: "Dovre", nr: "3431", agR: 0.20},
    {fylke: "Innlandet", kommune: "Eidskog", nr: "3416", agR: 0.20},
    {fylke: "Innlandet", kommune: "Elverum", nr: "3420", agR: 0.20},
    {fylke: "Innlandet", kommune: "Engerdal", nr: "3425", agR: 0.20},
    {fylke: "Innlandet", kommune: "Etnedal", nr: "3450", agR: 0.20},
    {fylke: "Innlandet", kommune: "Folldal", nr: "3429", agR: 0.20},
    {fylke: "Innlandet", kommune: "Gausdal", nr: "3441", agR: 0.20},
    {fylke: "Innlandet", kommune: "Gjøvik", nr: "3407", agR: 0.20},
    {fylke: "Innlandet", kommune: "Gran", nr: "3446", agR: 0.20},
    {fylke: "Innlandet", kommune: "Grue", nr: "3417", agR: 0.20},
    {fylke: "Innlandet", kommune: "Hamar", nr: "3403", agR: 0.20},
    {fylke: "Innlandet", kommune: "Kongsvinger", nr: "3401", agR: 0.20},
    {fylke: "Innlandet", kommune: "Lesja", nr: "3432", agR: 0.25},
    {fylke: "Innlandet", kommune: "Lillehammer", nr: "3405", agR: 0.20},
    {fylke: "Innlandet", kommune: "Lom", nr: "3434", agR: 0.20},
    {fylke: "Innlandet", kommune: "Løten", nr: "3412", agR: 0.20},
    {fylke: "Innlandet", kommune: "Nord-Aurdal", nr: "3451", agR: 0.20},
    {fylke: "Innlandet", kommune: "Nord-Fron", nr: "3436", agR: 0.20},
    {fylke: "Innlandet", kommune: "Nord-Odal", nr: "3414", agR: 0.20},
    {fylke: "Innlandet", kommune: "Nordre Land", nr: "3448", agR: 0.20},
    {fylke: "Innlandet", kommune: "Os", nr: "3430", agR: 0.20},
    {fylke: "Innlandet", kommune: "Rendalen", nr: "3424", agR: 0.20},
    {fylke: "Innlandet", kommune: "Ringebu", nr: "3439", agR: 0.20},
    {fylke: "Innlandet", kommune: "Ringsaker", nr: "3411", agR: 0.20},
    {fylke: "Innlandet", kommune: "Sel", nr: "3437", agR: 0.20},
    {fylke: "Innlandet", kommune: "Skjåk", nr: "3433", agR: 0.30},
    {fylke: "Innlandet", kommune: "Stange", nr: "3413", agR: 0.20},
    {fylke: "Innlandet", kommune: "Stor-Elvdal", nr: "3423", agR: 0.20},
    {fylke: "Innlandet", kommune: "Søndre Land", nr: "3447", agR: 0.20},
    {fylke: "Innlandet", kommune: "Sør-Aurdal", nr: "3449", agR: 0.20},
    {fylke: "Innlandet", kommune: "Sør-Fron", nr: "3438", agR: 0.20},
    {fylke: "Innlandet", kommune: "Sør-Odal", nr: "3415", agR: 0.20},
    {fylke: "Innlandet", kommune: "Tolga", nr: "3426", agR: 0.20},
    {fylke: "Innlandet", kommune: "Trysil", nr: "3421", agR: 0.20},
    {fylke: "Innlandet", kommune: "Tynset", nr: "3427", agR: 0.20},
    {fylke: "Innlandet", kommune: "Vang", nr: "3454", agR: 0.20},
    {fylke: "Innlandet", kommune: "Vestre Slidre", nr: "3452", agR: 0.20},
    {fylke: "Innlandet", kommune: "Vestre Toten", nr: "3443", agR: 0.20},
    {fylke: "Innlandet", kommune: "Vågå", nr: "3435", agR: 0.20},
    {fylke: "Innlandet", kommune: "Våler", nr: "3419", agR: 0.20},
    {fylke: "Innlandet", kommune: "Østre Toten", nr: "3442", agR: 0.20},
    {fylke: "Innlandet", kommune: "Øyer", nr: "3440", agR: 0.20},
    {fylke: "Innlandet", kommune: "Øystre Slidre", nr: "3453", agR: 0.20},
    {fylke: "Innlandet", kommune: "Åmot", nr: "3422", agR: 0.20},
    {fylke: "Innlandet", kommune: "Åsnes", nr: "3418", agR: 0.20},
    {fylke: "Vestfold og Telemark", kommune: "Bamble", nr: "3813", agR: 0.20},
    {fylke: "Vestfold og Telemark", kommune: "Drangedal", nr: "3815", agR: 0.20},
    {fylke: "Vestfold og Telemark", kommune: "Fyresdal", nr: "3823", agR: 0.30},
    {fylke: "Vestfold og Telemark", kommune: "Færder", nr: "3811", agR: 0.20},
    {fylke: "Vestfold og Telemark", kommune: "Hjartdal", nr: "3819", agR: 0.25},
    {fylke: "Vestfold og Telemark", kommune: "Holmestrand", nr: "3802", agR: 0.20},
    {fylke: "Vestfold og Telemark", kommune: "Horten", nr: "3801", agR: 0.20},
    {fylke: "Vestfold og Telemark", kommune: "Kragerø", nr: "3814", agR: 0.20},
    {fylke: "Vestfold og Telemark", kommune: "Kviteseid", nr: "3821", agR: 0.25},
    {fylke: "Vestfold og Telemark", kommune: "Larvik", nr: "3805", agR: 0.20},
    {fylke: "Vestfold og Telemark", kommune: "Midt-Telemark", nr: "3817", agR: 0.20},
    {fylke: "Vestfold og Telemark", kommune: "Nissedal", nr: "3822", agR: 0.25},
    {fylke: "Vestfold og Telemark", kommune: "Nome", nr: "3816", agR: 0.20},
    {fylke: "Vestfold og Telemark", kommune: "Notodden", nr: "3808", agR: 0.20},
    {fylke: "Vestfold og Telemark", kommune: "Porsgrunn", nr: "3806", agR: 0.20},
    {fylke: "Vestfold og Telemark", kommune: "Sandefjord", nr: "3804", agR: 0.20},
    {fylke: "Vestfold og Telemark", kommune: "Seljord", nr: "3820", agR: 0.25},
    {fylke: "Vestfold og Telemark", kommune: "Siljan", nr: "3812", agR: 0.20},
    {fylke: "Vestfold og Telemark", kommune: "Skien", nr: "3807", agR: 0.20},
    {fylke: "Vestfold og Telemark", kommune: "Tinn", nr: "3818", agR: 0.25},
    {fylke: "Vestfold og Telemark", kommune: "Tokke", nr: "3824", agR: 0.30},
    {fylke: "Vestfold og Telemark", kommune: "Tønsberg", nr: "3803", agR: 0.20},
    {fylke: "Vestfold og Telemark", kommune: "Vinje", nr: "3825", agR: 0.35},
    {fylke: "Agder", kommune: "Arendal", nr: "4203", agR: 0.25},
    {fylke: "Agder", kommune: "Birkenes", nr: "4216", agR: 0.30},
    {fylke: "Agder", kommune: "Bygland", nr: "4220", agR: 0.35},
    {fylke: "Agder", kommune: "Bykle", nr: "4222", agR: 0.35},
    {fylke: "Agder", kommune: "Evje og Hornnes", nr: "4219", agR: 0.30},
    {fylke: "Agder", kommune: "Farsund", nr: "4206", agR: 0.35},
    {fylke: "Agder", kommune: "Flekkefjord", nr: "4207", agR: 0.40},
    {fylke: "Agder", kommune: "Froland", nr: "4214", agR: 0.25},
    {fylke: "Agder", kommune: "Gjerstad", nr: "4211", agR: 0.20},
    {fylke: "Agder", kommune: "Grimstad", nr: "4202", agR: 0.30},
    {fylke: "Agder", kommune: "Hægebostad", nr: "4226", agR: 0.40},
    {fylke: "Agder", kommune: "Iveland", nr: "4218", agR: 0.30},
    {fylke: "Agder", kommune: "Kristiansand", nr: "4204", agR: 0.35},
    {fylke: "Agder", kommune: "Kvinesdal", nr: "4227", agR: 0.40},
    {fylke: "Agder", kommune: "Lillesand", nr: "4215", agR: 0.35},
    {fylke: "Agder", kommune: "Lindesnes", nr: "4205", agR: 0.35},
    {fylke: "Agder", kommune: "Lyngdal", nr: "4225", agR: 0.35},
    {fylke: "Agder", kommune: "Risør", nr: "4201", agR: 0.20},
    {fylke: "Agder", kommune: "Sirdal", nr: "4228", agR: 0.40},
    {fylke: "Agder", kommune: "Tvedestrand", nr: "4213", agR: 0.25},
    {fylke: "Agder", kommune: "Valle", nr: "4221", agR: 0.35},
    {fylke: "Agder", kommune: "Vegårshei", nr: "4212", agR: 0.20},
    {fylke: "Agder", kommune: "Vennesla", nr: "4223", agR: 0.35},
    {fylke: "Agder", kommune: "Åmli", nr: "4217", agR: 0.25},
    {fylke: "Agder", kommune: "Åseral", nr: "4224", agR: 0.40},
    {fylke: "Rogaland", kommune: "Bjerkreim", nr: "1114", agR: 0.40},
    {fylke: "Rogaland", kommune: "Bokn", nr: "1145", agR: 0.45},
    {fylke: "Rogaland", kommune: "Eigersund", nr: "1101", agR: 0.40},
    {fylke: "Rogaland", kommune: "Gjesdal", nr: "1122", agR: 0.40},
    {fylke: "Rogaland", kommune: "Haugesund", nr: "1106", agR: 0.55},
    {fylke: "Rogaland", kommune: "Hjelmeland", nr: "1133", agR: 0.40},
    {fylke: "Rogaland", kommune: "Hå", nr: "1119", agR: 0.40},
    {fylke: "Rogaland", kommune: "Karmøy", nr: "1149", agR: 0.55},
    {fylke: "Rogaland", kommune: "Klepp", nr: "1120", agR: 0.40},
    {fylke: "Rogaland", kommune: "Kvitsøy", nr: "1144", agR: 0.45},
    {fylke: "Rogaland", kommune: "Lund", nr: "1112", agR: 0.40},
    {fylke: "Rogaland", kommune: "Randaberg", nr: "1127", agR: 0.45},
    {fylke: "Rogaland", kommune: "Sandnes", nr: "1108", agR: 0.40},
    {fylke: "Rogaland", kommune: "Sauda", nr: "1135", agR: 0.40},
    {fylke: "Rogaland", kommune: "Sokndal", nr: "1111", agR: 0.40},
    {fylke: "Rogaland", kommune: "Sola", nr: "1124", agR: 0.45},
    {fylke: "Rogaland", kommune: "Stavanger", nr: "1103", agR: 0.45},
    {fylke: "Rogaland", kommune: "Strand", nr: "1130", agR: 0.45},
    {fylke: "Rogaland", kommune: "Suldal", nr: "1134", agR: 0.40},
    {fylke: "Rogaland", kommune: "Time", nr: "1121", agR: 0.40},
    {fylke: "Rogaland", kommune: "Tysvær", nr: "1146", agR: 0.45},
    {fylke: "Rogaland", kommune: "Utsira", nr: "1151", agR: 0.55},
    {fylke: "Rogaland", kommune: "Vindafjord", nr: "1160", agR: 0.45},
    {fylke: "Vestland", kommune: "Alver", nr: "4631", agR: 0.60},
    {fylke: "Vestland", kommune: "Askvoll", nr: "4645", agR: 0.60},
    {fylke: "Vestland", kommune: "Askøy", nr: "4627", agR: 0.60},
    {fylke: "Vestland", kommune: "Aurland", nr: "4641", agR: 0.35},
    {fylke: "Vestland", kommune: "Austevoll", nr: "4625", agR: 0.60},
    {fylke: "Vestland", kommune: "Austrheim", nr: "4632", agR: 0.60},
    {fylke: "Vestland", kommune: "Bergen", nr: "4601", agR: 0.55},
    {fylke: "Vestland", kommune: "Bjerkreim", nr: "4624", agR: 0.50},
    {fylke: "Vestland", kommune: "Bremanger", nr: "4648", agR: 0.60},
    {fylke: "Vestland", kommune: "Bømlo", nr: "4613", agR: 0.60},
    {fylke: "Vestland", kommune: "Eidfjord", nr: "4619", agR: 0.40},
    {fylke: "Vestland", kommune: "Etne", nr: "4611", agR: 0.45},
    {fylke: "Vestland", kommune: "Fedje", nr: "4633", agR: 0.60},
    {fylke: "Vestland", kommune: "Fitjar", nr: "4615", agR: 0.60},
    {fylke: "Vestland", kommune: "Fjaler", nr: "4646", agR: 0.60},
    {fylke: "Vestland", kommune: "Gloppen", nr: "4650", agR: 0.55},
    {fylke: "Vestland", kommune: "Gulen", nr: "4635", agR: 0.60},
    {fylke: "Vestland", kommune: "Hyllestad", nr: "4637", agR: 0.60},
    {fylke: "Vestland", kommune: "Høyanger", nr: "4638", agR: 0.55},
    {fylke: "Vestland", kommune: "Kinn", nr: "4602", agR: 0.60},
    {fylke: "Vestland", kommune: "Kvam", nr: "4622", agR: 0.45},
    {fylke: "Vestland", kommune: "Kvinnherad", nr: "4617", agR: 0.45},
    {fylke: "Vestland", kommune: "Luster", nr: "4644", agR: 0.30},
    {fylke: "Vestland", kommune: "Lærdal", nr: "4642", agR: 0.25},
    {fylke: "Vestland", kommune: "Masfjorden", nr: "4634", agR: 0.60},
    {fylke: "Vestland", kommune: "Modalen", nr: "4629", agR: 0.55},
    {fylke: "Vestland", kommune: "Osterøy", nr: "4630", agR: 0.55},
    {fylke: "Vestland", kommune: "Samnanger", nr: "4623", agR: 0.50},
    {fylke: "Vestland", kommune: "Sogndal", nr: "4640", agR: 0.45},
    {fylke: "Vestland", kommune: "Solund", nr: "4636", agR: 0.60},
    {fylke: "Vestland", kommune: "Stad", nr: "4649", agR: 0.60},
    {fylke: "Vestland", kommune: "Stord", nr: "4614", agR: 0.50},
    {fylke: "Vestland", kommune: "Stryn", nr: "4651", agR: 0.50},
    {fylke: "Vestland", kommune: "Sunnfjord", nr: "4647", agR: 0.55},
    {fylke: "Vestland", kommune: "Sveio", nr: "4612", agR: 0.50},
    {fylke: "Vestland", kommune: "Tysnes", nr: "4616", agR: 0.50},
    {fylke: "Vestland", kommune: "Ullensvang", nr: "4618", agR: 0.40},
    {fylke: "Vestland", kommune: "Ulvik", nr: "4620", agR: 0.40},
    {fylke: "Vestland", kommune: "Vaksdal", nr: "4628", agR: 0.50},
    {fylke: "Vestland", kommune: "Vik", nr: "4639", agR: 0.45},
    {fylke: "Vestland", kommune: "Voss", nr: "4621", agR: 0.40},
    {fylke: "Vestland", kommune: "Øygarden", nr: "4626", agR: 0.60},
    {fylke: "Vestland", kommune: "Årdal", nr: "4643", agR: 0.25},
    {fylke: "Møre og Romsdal", kommune: "Aukra", nr: "1547", agR: 0.40},
    {fylke: "Møre og Romsdal", kommune: "Aure", nr: "1576", agR: 0.25},
    {fylke: "Møre og Romsdal", kommune: "Averøy", nr: "1554", agR: 0.30},
    {fylke: "Møre og Romsdal", kommune: "Fjord", nr: "1578", agR: 0.45},
    {fylke: "Møre og Romsdal", kommune: "Giske", nr: "1532", agR: 0.50},
    {fylke: "Møre og Romsdal", kommune: "Gjemnes", nr: "1557", agR: 0.30},
    {fylke: "Møre og Romsdal", kommune: "Hareid", nr: "1517", agR: 0.55},
    {fylke: "Møre og Romsdal", kommune: "Herøy", nr: "1515", agR: 0.55},
    {fylke: "Møre og Romsdal", kommune: "Hustadvika", nr: "1579", agR: 0.40},
    {fylke: "Møre og Romsdal", kommune: "Kristiansund", nr: "1505", agR: 0.25},
    {fylke: "Møre og Romsdal", kommune: "Molde", nr: "1506", agR: 0.40},
    {fylke: "Møre og Romsdal", kommune: "Rauma", nr: "1539", agR: 0.40},
    {fylke: "Møre og Romsdal", kommune: "Sande", nr: "1514", agR: 0.60},
    {fylke: "Møre og Romsdal", kommune: "Smøla", nr: "1573", agR: 0.25},
    {fylke: "Møre og Romsdal", kommune: "Stranda", nr: "1525", agR: 0.50},
    {fylke: "Møre og Romsdal", kommune: "Sula", nr: "1531", agR: 0.55},
    {fylke: "Møre og Romsdal", kommune: "Sunndal", nr: "1563", agR: 0.25},
    {fylke: "Møre og Romsdal", kommune: "Surnadal", nr: "1566", agR: 0.25},
    {fylke: "Møre og Romsdal", kommune: "Sykkylven", nr: "1528", agR: 0.50},
    {fylke: "Møre og Romsdal", kommune: "Tingvoll", nr: "1560", agR: 0.30},
    {fylke: "Møre og Romsdal", kommune: "Ulstein", nr: "1516", agR: 0.55},
    {fylke: "Møre og Romsdal", kommune: "Vanylven", nr: "1511", agR: 0.60},
    {fylke: "Møre og Romsdal", kommune: "Vestnes", nr: "1535", agR: 0.45},
    {fylke: "Møre og Romsdal", kommune: "Volda", nr: "1577", agR: 0.60},
    {fylke: "Møre og Romsdal", kommune: "Ørsta", nr: "1520", agR: 0.55},
    {fylke: "Møre og Romsdal", kommune: "Ålesund", nr: "1507", agR: 0.45},
    {fylke: "Trøndelag", kommune: "Flatanger", nr: "5049", agR: 0.25},
    {fylke: "Trøndelag", kommune: "Frosta", nr: "5036", agR: 0.25},
    {fylke: "Trøndelag", kommune: "Frøya", nr: "5014", agR: 0.20},
    {fylke: "Trøndelag", kommune: "Grong", nr: "5045", agR: 0.20},
    {fylke: "Trøndelag", kommune: "Heim", nr: "5055", agR: 0.25},
    {fylke: "Trøndelag", kommune: "Hitra", nr: "5056", agR: 0.25},
    {fylke: "Trøndelag", kommune: "Holtålen", nr: "5026", agR: 0.20},
    {fylke: "Trøndelag", kommune: "Høylandet", nr: "5046", agR: 0.25},
    {fylke: "Trøndelag", kommune: "Indørøy", nr: "5053", agR: 0.25},
    {fylke: "Trøndelag", kommune: "Indre Fosen", nr: "5054", agR: 0.25},
    {fylke: "Trøndelag", kommune: "Leka", nr: "5052", agR: 0.25},
    {fylke: "Trøndelag", kommune: "Levanger", nr: "5037", agR: 0.20},
    {fylke: "Trøndelag", kommune: "Lierne", nr: "5042", agR: 0.20},
    {fylke: "Trøndelag", kommune: "Malvik", nr: "5031", agR: 0.20},
    {fylke: "Trøndelag", kommune: "Melhus", nr: "5028", agR: 0.25},
    {fylke: "Trøndelag", kommune: "Meråker", nr: "5034", agR: 0.20},
    {fylke: "Trøndelag", kommune: "Midtre Gauldal", nr: "5027", agR: 0.20},
    {fylke: "Trøndelag", kommune: "Namsos", nr: "5048", agR: 0.20},
    {fylke: "Trøndelag", kommune: "Nærøysund", nr: "5060", agR: 0.25},
    {fylke: "Trøndelag", kommune: "Oppdal", nr: "5021", agR: 0.20},
    {fylke: "Trøndelag", kommune: "Orkland", nr: "5059", agR: 0.25},
    {fylke: "Trøndelag", kommune: "Osen", nr: "5020", agR: 0.25},
    {fylke: "Trøndelag", kommune: "Overhalla", nr: "5047", agR: 0.25},
    {fylke: "Trøndelag", kommune: "Rennebu", nr: "5022", agR: 0.20},
    {fylke: "Trøndelag", kommune: "Rindal", nr: "5061", agR: 0.25},
    {fylke: "Trøndelag", kommune: "Røros", nr: "5025", agR: 0.20},
    {fylke: "Trøndelag", kommune: "Røyrvik", nr: "5043", agR: 0.20},
    {fylke: "Trøndelag", kommune: "Selbu", nr: "5032", agR: 0.20},
    {fylke: "Trøndelag", kommune: "Skaun", nr: "5029", agR: 0.25},
    {fylke: "Trøndelag", kommune: "Snåsa", nr: "5041", agR: 0.20},
    {fylke: "Trøndelag", kommune: "Steinkjer", nr: "5006", agR: 0.20},
    {fylke: "Trøndelag", kommune: "Stjørdal", nr: "5035", agR: 0.20},
    {fylke: "Trøndelag", kommune: "Trondheim", nr: "5001", agR: 0.25},
    {fylke: "Trøndelag", kommune: "Tydal", nr: "5033", agR: 0.20},
    {fylke: "Trøndelag", kommune: "Verdal", nr: "5038", agR: 0.25},
    {fylke: "Trøndelag", kommune: "Ørland", nr: "5057", agR: 0.25},
    {fylke: "Trøndelag", kommune: "Åfjord", nr: "5058", agR: 0.25},
    {fylke: "Nordland", kommune: "Alstahaug", nr: "1820", agR: 0.35},
    {fylke: "Nordland", kommune: "Andøy", nr: "1871", agR: 0.40},
    {fylke: "Nordland", kommune: "Beiarn", nr: "1839", agR: 0.40},
    {fylke: "Nordland", kommune: "Bindal", nr: "1811", agR: 0.25},
    {fylke: "Nordland", kommune: "Bodø", nr: "1804", agR: 0.40},
    {fylke: "Nordland", kommune: "Brønny", nr: "1813", agR: 0.25},
    {fylke: "Nordland", kommune: "Bø", nr: "1867", agR: 0.40},
    {fylke: "Nordland", kommune: "Dønna", nr: "1827", agR: 0.30},
    {fylke: "Nordland", kommune: "Evenes", nr: "1853", agR: 0.40},
    {fylke: "Nordland", kommune: "Fauske - Fuossko", nr: "1841", agR: 0.30},
    {fylke: "Nordland", kommune: "Flakstad", nr: "1859", agR: 0.45},
    {fylke: "Nordland", kommune: "Gildeskål", nr: "1838", agR: 0.40},
    {fylke: "Nordland", kommune: "Grane", nr: "1825", agR: 0.25},
    {fylke: "Nordland", kommune: "Hadsel", nr: "1866", agR: 0.40},
    {fylke: "Nordland", kommune: "Hamarøy", nr: "1875", agR: 0.35},
    {fylke: "Nordland", kommune: "Hattfjelldal", nr: "1826", agR: 0.20},
    {fylke: "Nordland", kommune: "Hemnes", nr: "1832", agR: 0.30},
    {fylke: "Nordland", kommune: "Herøy", nr: "1818", agR: 0.25},
    {fylke: "Nordland", kommune: "Leirfjord", nr: "1822", agR: 0.35},
    {fylke: "Nordland", kommune: "Lurøy", nr: "1834", agR: 0.35},
    {fylke: "Nordland", kommune: "Lødingen", nr: "1851", agR: 0.40},
    {fylke: "Nordland", kommune: "Meløy", nr: "1837", agR: 0.40},
    {fylke: "Nordland", kommune: "Moskenes", nr: "1874", agR: 0.45},
    {fylke: "Nordland", kommune: "Narvik", nr: "1806", agR: 0.30},
    {fylke: "Nordland", kommune: "Nesna", nr: "1828", agR: 0.35},
    {fylke: "Nordland", kommune: "Rana", nr: "1833", agR: 0.30},
    {fylke: "Nordland", kommune: "Rødøy", nr: "1836", agR: 0.40},
    {fylke: "Nordland", kommune: "Røst", nr: "1856", agR: 0.45},
    {fylke: "Nordland", kommune: "Saltdal", nr: "1840", agR: 0.30},
    {fylke: "Nordland", kommune: "Sortland", nr: "1870", agR: 0.40},
    {fylke: "Nordland", kommune: "Steigen", nr: "1848", agR: 0.40},
    {fylke: "Nordland", kommune: "Sømna", nr: "1812", agR: 0.25},
    {fylke: "Nordland", kommune: "Sørfold", nr: "1845", agR: 0.30},
    {fylke: "Nordland", kommune: "Træna", nr: "1835", agR: 0.30},
    {fylke: "Nordland", kommune: "Vefsn", nr: "1824", agR: 0.30},
    {fylke: "Nordland", kommune: "Vega", nr: "1815", agR: 0.25},
    {fylke: "Nordland", kommune: "Vestvågøy", nr: "1860", agR: 0.45},
    {fylke: "Nordland", kommune: "Vevelstad", nr: "1816", agR: 0.30},
    {fylke: "Nordland", kommune: "Værøy", nr: "1857", agR: 0.45},
    {fylke: "Nordland", kommune: "Vågan", nr: "1865", agR: 0.40},
    {fylke: "Nordland", kommune: "Øksnes", nr: "1868", agR: 0.40},
    {fylke: "Troms og Finnmark", kommune: "Alta", nr: "5403", agR: 0.20},
    {fylke: "Troms og Finnmark", kommune: "Balsfjord", nr: "5422", agR: 0.20},
    {fylke: "Troms og Finnmark", kommune: "Bardu", nr: "5416", agR: 0.20},
    {fylke: "Troms og Finnmark", kommune: "Berlevåg", nr: "5440", agR: 0.20},
    {fylke: "Troms og Finnmark", kommune: "Båtsfjord", nr: "5443", agR: 0.20},
    {fylke: "Troms og Finnmark", kommune: "Dyrøy", nr: "5420", agR: 0.35},
    {fylke: "Troms og Finnmark", kommune: "Gamvik", nr: "5439", agR: 0.20},
    {fylke: "Troms og Finnmark", kommune: "Gratangen", nr: "5414", agR: 0.35},
    {fylke: "Troms og Finnmark", kommune: "Hammerfest", nr: "5406", agR: 0.20},
    {fylke: "Troms og Finnmark", kommune: "Harstad", nr: "5402", agR: 0.40},
    {fylke: "Troms og Finnmark", kommune: "Hasvik", nr: "5433", agR: 0.20},
    {fylke: "Troms og Finnmark", kommune: "Ibestad", nr: "5413", agR: 0.40},
    {fylke: "Troms og Finnmark", kommune: "Karasjok", nr: "5437", agR: 0.20},
    {fylke: "Troms og Finnmark", kommune: "Karlsøy", nr: "5423", agR: 0.20},
    {fylke: "Troms og Finnmark", kommune: "Kautokeino", nr: "5430", agR: 0.20},
    {fylke: "Troms og Finnmark", kommune: "Kvæfjord", nr: "5411", agR: 0.40},
    {fylke: "Troms og Finnmark", kommune: "Kvænangen", nr: "5429", agR: 0.20},
    {fylke: "Troms og Finnmark", kommune: "Kåfjord", nr: "5426", agR: 0.20},
    {fylke: "Troms og Finnmark", kommune: "Lavangen", nr: "5415", agR: 0.35},
    {fylke: "Troms og Finnmark", kommune: "Lebesby", nr: "5438", agR: 0.20},
    {fylke: "Troms og Finnmark", kommune: "Loppa", nr: "5432", agR: 0.20},
    {fylke: "Troms og Finnmark", kommune: "Lyngen", nr: "5424", agR: 0.20},
    {fylke: "Troms og Finnmark", kommune: "Måsøy", nr: "5434", agR: 0.20},
    {fylke: "Troms og Finnmark", kommune: "Måsøy", nr: "5442", agR: 0.20},
    {fylke: "Troms og Finnmark", kommune: "Nordkapp", nr: "5435", agR: 0.20},
    {fylke: "Troms og Finnmark", kommune: "Nordreisa", nr: "5428", agR: 0.20},
    {fylke: "Troms og Finnmark", kommune: "Porsanger", nr: "5436", agR: 0.20},
    {fylke: "Troms og Finnmark", kommune: "Salangen", nr: "5417", agR: 0.35},
    {fylke: "Troms og Finnmark", kommune: "Senja", nr: "5421", agR: 0.35},
    {fylke: "Troms og Finnmark", kommune: "Skjervøy", nr: "5427", agR: 0.20},
    {fylke: "Troms og Finnmark", kommune: "Storfjord", nr: "5425", agR: 0.20},
    {fylke: "Troms og Finnmark", kommune: "Sør-Varanger", nr: "5419", agR: 0.35},
    {fylke: "Troms og Finnmark", kommune: "Tana", nr: "5441", agR: 0.20},
    {fylke: "Troms og Finnmark", kommune: "Tjeldsund", nr: "5412", agR: 0.40},
    {fylke: "Troms og Finnmark", kommune: "Tromsø", nr: "5401", agR: 0.25},
    {fylke: "Troms og Finnmark", kommune: "Vadsø", nr: "5405", agR: 0.20},
    {fylke: "Troms og Finnmark", kommune: "Varda", nr: "5404", agR: 0.20}
];

// Load Norway seismic data (now synchronous since data is embedded)
function loadNorwaySeismicData() {
    console.log('Norway seismic data loaded:', norwaySeismicData.length, 'entries');
    populateFylkeOptions();
}

// Get unique fylke values
function getUniqueFylker() {
    const fylker = [...new Set(norwaySeismicData.map(item => item.fylke))];
    return fylker.sort();
}

// Get kommuner for a specific fylke
function getKommunerForFylke(fylke) {
    const kommuner = norwaySeismicData
        .filter(item => item.fylke === fylke)
        .map(item => item.kommune)
        .sort();
    return kommuner;
}

// Get agR value for specific fylke and kommune
function getAgRForLocation(fylke, kommune) {
    const entry = norwaySeismicData.find(item => 
        item.fylke === fylke && item.kommune === kommune
    );
    return entry ? entry.agR : null;
}

// Populate fylke dropdown
function populateFylkeOptions() {
    const fylkeSelect = document.getElementById('fylke');
    if (!fylkeSelect) return;
    
    // Clear existing options except the first one
    fylkeSelect.innerHTML = '<option value="">Select fylke...</option>';
    
    const fylker = getUniqueFylker();
    fylker.forEach(fylke => {
        const option = document.createElement('option');
        option.value = fylke;
        option.textContent = fylke;
        fylkeSelect.appendChild(option);
    });
}

// Populate kommune dropdown based on selected fylke
function populateKommuneOptions(selectedFylke) {
    const kommuneSelect = document.getElementById('kommune');
    if (!kommuneSelect) return;
    
    // Clear existing options
    kommuneSelect.innerHTML = '<option value="">Select kommune...</option>';
    
    if (selectedFylke) {
        const kommuner = getKommunerForFylke(selectedFylke);
        kommuner.forEach(kommune => {
            const option = document.createElement('option');
            option.value = kommune;
            option.textContent = kommune;
            kommuneSelect.appendChild(option);
        });
    }
    
    // Clear agR display when fylke changes
    updateNorwayAgRDisplay();
}

// Update agR display for Norway selection
function updateNorwayAgRDisplay() {
    const fylke = document.getElementById('fylke')?.value;
    const kommune = document.getElementById('kommune')?.value;
    const agrDisplay = document.getElementById('agr_norway_display');
    const agrInput = document.getElementById('agr');
    
    if (fylke && kommune && agrDisplay) {
        const agRValue = getAgRForLocation(fylke, kommune);
        if (agRValue !== null) {
            agrDisplay.textContent = toFixedIfNeeded(agRValue, 1);
            // Update the main agR input for calculations
            if (agrInput) {
                agrInput.value = agRValue;
                // Trigger calculation update
                updateCalculatedValues();
            }
        } else {
            agrDisplay.textContent = 'Not found';
        }
    } else {
        if (agrDisplay) {
            agrDisplay.textContent = '-';
        }
    }
}

// Handle country selection change
function handleCountryChange() {
    const country = document.getElementById('country')?.value;
    const customPlaceInput = document.getElementById('custom_place_input');
    const customAgrInput = document.getElementById('custom_agr_input');
    const norwayLocation = document.getElementById('norway_location');
    const norwayAgrDisplay = document.getElementById('norway_agr_display');
    
    if (country === 'norway') {
        // Show Norway location selection, hide custom place and agR input
        if (customPlaceInput) customPlaceInput.style.display = 'none';
        if (customAgrInput) customAgrInput.style.display = 'none';
        if (norwayLocation) norwayLocation.style.display = 'block';
        if (norwayAgrDisplay) norwayAgrDisplay.style.display = 'flex';
        
        // Load Norway data if not already loaded
        if (norwaySeismicData.length === 0) {
            loadNorwaySeismicData();
        }
    } else {
        // Show custom inputs, hide Norway selection
        if (customPlaceInput) customPlaceInput.style.display = 'flex';
        if (customAgrInput) customAgrInput.style.display = 'flex';
        if (norwayLocation) norwayLocation.style.display = 'none';
        if (norwayAgrDisplay) norwayAgrDisplay.style.display = 'none';
        
        // Reset agR to default custom value
        const agrInput = document.getElementById('agr');
        if (agrInput && !agrInput.value) {
            agrInput.value = 0.7;
        }
        updateCalculatedValues();
    }
}

// Handle fylke selection change
function handleFylkeChange() {
    const fylke = document.getElementById('fylke')?.value;
    populateKommuneOptions(fylke);
}

// Handle kommune selection change
function handleKommuneChange() {
    updateNorwayAgRDisplay();
}

// Seismic class to gamma_I mapping (Table NA.4 from Norwegian National Annex)
const GAMMA_I_VALUES = {
    'I': 0.8,
    'II': 1.0,
    'IIIa': 1.2,
    'IIIb': 1.2,
    'IV': 1.4
};

// Soil factor values by ground type (typical EC8 values)
const SOIL_FACTORS = {
    'A': 1.0,
    'B': 1.2,
    'C': 1.15,
    'D': 1.35,
    'E': 1.4
};

// Ct values for different structure types
const CT_VALUES = {
    'steel': 0.085,
    'concrete': 0.075,
    'other': 0.05
};

// Response spectrum parameters from EC8 Table 3.2 and 3.3
const SPECTRUM_PARAMETERS = {
    '1': { // Type 1 spectrum (Ms > 5.5)
        'A': { S: 1.0, TB: 0.15, TC: 0.4, TD: 2.0 },
        'B': { S: 1.2, TB: 0.15, TC: 0.5, TD: 2.0 },
        'C': { S: 1.15, TB: 0.20, TC: 0.6, TD: 2.0 },
        'D': { S: 1.35, TB: 0.20, TC: 0.8, TD: 2.0 },
        'E': { S: 1.4, TB: 0.15, TC: 0.5, TD: 2.0 }
    },
    '2': { // Type 2 spectrum (Ms ≤ 5.5)
        'A': { S: 1.0, TB: 0.05, TC: 0.25, TD: 1.2 },
        'B': { S: 1.35, TB: 0.05, TC: 0.25, TD: 1.2 },
        'C': { S: 1.5, TB: 0.10, TC: 0.25, TD: 1.2 },
        'D': { S: 1.8, TB: 0.10, TC: 0.30, TD: 1.2 },
        'E': { S: 1.6, TB: 0.05, TC: 0.25, TD: 1.2 }
    }
};

// Update gamma_I based on seismic class selection
function updateGammaI() {
    const seismicClass = document.getElementById('seismic_class')?.value;
    const gammaIInput = document.getElementById('gamma_I');
    
    if (seismicClass && gammaIInput && GAMMA_I_VALUES[seismicClass]) {
        gammaIInput.value = GAMMA_I_VALUES[seismicClass];
        console.log('Updated gamma_I for seismic class', seismicClass, ':', GAMMA_I_VALUES[seismicClass]);
        updateCalculatedValues();
    }
}

// Update spectrum parameters based on spectrum type and ground type
function updateSpectrumParameters() {
    const spectrumType = document.getElementById('spectrum_type').value;
    const groundType = document.getElementById('ground_type').value;
    const soilFactorInput = document.getElementById('S');
    const soilFactorDisplay = document.getElementById('S_display');
    
    const params = SPECTRUM_PARAMETERS[spectrumType][groundType];
    
    // Update both hidden input and display
    soilFactorInput.value = params.S;
    soilFactorDisplay.textContent = params.S;
    
    // Update table reference
    const tableRef = document.querySelector('#S_display').nextElementSibling;
    tableRef.textContent = `(from Table 3.${spectrumType === '1' ? '2' : '3'})`;
    
    updateCalculatedValues();
}

// Update Ct based on structure type
function updateCt() {
    const ctMethod = document.getElementById('ct_method').value;
    const ctInput = document.getElementById('ct');
    
    if (ctMethod !== 'custom') {
        ctInput.value = CT_VALUES[ctMethod];
        ctInput.disabled = true;
        ctInput.style.backgroundColor = '#374151';
    } else {
        ctInput.disabled = false;
        ctInput.style.backgroundColor = '#4b5563';
    }
    updateCalculatedValues();
}

// Toggle between manual and simplified Sd method
function toggleSdMethod() {
    const method = document.getElementById('sd_method').value;
    const manualInput = document.getElementById('manual_sd_input');
    const simplifiedInputs = document.getElementById('simplified_inputs');
    
    if (method === 'manual') {
        manualInput.style.display = 'flex';
        simplifiedInputs.style.display = 'none';
    } else {
        manualInput.style.display = 'none';
        simplifiedInputs.style.display = 'block';
    }
    updateCalculatedValues();
}

// Update calculated values in real-time
function updateCalculatedValues() {
    const agr = parseFloat(document.getElementById('agr').value) || 0;
    const gammaI = parseFloat(document.getElementById('gamma_I').value) || 1.0;
    const S = parseFloat(document.getElementById('S').value) || 1.2;
    const h = parseFloat(document.getElementById('h').value) || 20;
    const ct = parseFloat(document.getElementById('ct').value) || 0.075;
    
    // Calculate ag
    const ag = agr * gammaI;
    document.getElementById('ag_display').textContent = toFixedIfNeeded(ag);
    
    // Calculate ag*S
    const agS = ag * S;
    document.getElementById('ags_display').textContent = toFixedIfNeeded(agS);
    
    // Calculate T1 for simplified method
    const T1 = ct * Math.pow(h, 0.75);
    document.getElementById('t1_display').textContent = toFixedIfNeeded(T1, 3);
    
    // Calculate Sd for simplified method
    if (document.getElementById('sd_method').value === 'simplified') {
        const Sd = calculateSd(T1, ag, S);
        document.getElementById('sd_display').textContent = toFixedIfNeeded(Sd);
    } else {
        const SdManual = parseFloat(document.getElementById('sd_manual').value) || 0;
        document.getElementById('sd_display').textContent = toFixedIfNeeded(SdManual);
    }
    
    // Update parameter summary
    updateParameterSummary();
    
    // Update spectrum plot in real-time
    const spectrumData = generateSpectrumData(ag, S);
    if (spectrumData.length > 0) {
        const Sd_T1 = calculateSd(T1, ag, S);
        createSpectrumPlot(spectrumData, T1, Sd_T1);
    }
}

// Update parameter summary display
function updateParameterSummary() {
    const spectrumType = document.getElementById('spectrum_type')?.value || '2';
    const groundType = document.getElementById('ground_type')?.value || 'B';
    const seismicClass = document.getElementById('seismic_class')?.value || 'II';
    const gammaI = parseFloat(document.getElementById('gamma_I')?.value) || 1.0;
    const agr = parseFloat(document.getElementById('agr')?.value) || 0.7;
    const q = parseFloat(document.getElementById('q')?.value) || 1.5;
    
    // Get spectrum parameters
    let params = { S: 1.35, TB: 0.05, TC: 0.25, TD: 1.2 }; // defaults
    if (SPECTRUM_PARAMETERS && SPECTRUM_PARAMETERS[spectrumType] && SPECTRUM_PARAMETERS[spectrumType][groundType]) {
        params = SPECTRUM_PARAMETERS[spectrumType][groundType];
    }
    
    const ag = agr * gammaI;
    const agS = ag * params.S;
    
    const parameterHTML = `
        <div class="space-y-2">
            <div class="font-semibold text-blue-300">Seismic Parameters</div>
            <div>Seismic Class: <span class="text-green-400">${seismicClass}</span></div>
            <div>γ<sub>I</sub>: <span class="text-green-400">${toFixedIfNeeded(gammaI, 1)}</span></div>
            <div>a<sub>gR</sub>: <span class="text-green-400">${toFixedIfNeeded(agr, 1)} m/s²</span></div>
            <div>a<sub>g</sub>: <span class="text-green-400">${toFixedIfNeeded(ag)} m/s²</span></div>
            <div>q: <span class="text-green-400">${toFixedIfNeeded(q, 1)}</span></div>
        </div>
        <div class="space-y-2">
            <div class="font-semibold text-yellow-300">Spectrum Parameters</div>
            <div>Type: <span class="text-green-400">${spectrumType === '1' ? 'Type 1 (Ms > 5.5)' : 'Type 2 (Ms ≤ 5.5)'}</span></div>
            <div>Ground Type: <span class="text-green-400">${groundType}</span></div>
            <div>S: <span class="text-green-400">${toFixedIfNeeded(params.S, 2)}</span></div>
            <div>a<sub>g</sub>·S: <span class="text-green-400">${toFixedIfNeeded(agS)} m/s²</span></div>
        </div>
        <div class="space-y-2">
            <div class="font-semibold text-red-300">Period Parameters</div>
            <div>T<sub>B</sub>: <span class="text-green-400">${toFixedIfNeeded(params.TB, 2)} s</span></div>
            <div>T<sub>C</sub>: <span class="text-green-400">${toFixedIfNeeded(params.TC, 2)} s</span></div>
            <div>T<sub>D</sub>: <span class="text-green-400">${toFixedIfNeeded(params.TD, 1)} s</span></div>
        </div>
    `;
    
    const summaryElement = document.getElementById('parameter-details');
    if (summaryElement) {
        summaryElement.innerHTML = parameterHTML;
    }
}

// Calculate Sd(T) for a specific period (used for hover functionality)
function calculateSdAtPeriod(T, ag, S, spectrumType, groundType) {
    const params = SPECTRUM_PARAMETERS[spectrumType][groundType];
    
    // EC8 parameters from Table H.2.4
    //const q = 1.0;   // Behavior factor (for elastic analysis)
    const q = parseFloat(document.getElementById('q')?.value) || 1.5;   // Behavior factor from user input
    const TB = params.TB;
    const TC = params.TC;
    const TD = params.TD;
    
    let Sd;
    
    if (T >= 0 && T <= TB) {
        // Branch 1: 0 ≤ T ≤ TB (EC8 formula)
        Sd = ag * S * (2/3 + (T / TB) * (2.5/q - 2/3));
    } else if (T > TB && T <= TC) {
        // Branch 2: TB < T ≤ TC (EC8 formula)
        Sd = ag * S * (2.5 / q);
    } else if (T > TC && T <= TD) {
        // Branch 3: TC < T ≤ TD (EC8 formula with limit)
        Sd = Math.max(ag * S * 2.5 * (TC / T) / q, 0.2 * ag);
    } else {
        // Branch 4: T > TD (EC8 formula with limit)
        Sd = Math.max(ag * S * 2.5 * (TC * TD) / (T * T) / q, 0.2 * ag);
    }
    
    return Sd;
}

// Calculate Sd(T) according to EC8 response spectrum
function calculateSd(T, ag, S) {
    // Get spectrum parameters based on current selection
    const spectrumType = document.getElementById('spectrum_type').value;
    const groundType = document.getElementById('ground_type').value;
    const q = parseFloat(document.getElementById('q').value) || 1.5;
    
    return calculateSdAtPeriod(T, ag, S, spectrumType, groundType);
}

// Generate response spectrum data for plotting
function generateSpectrumData(ag, S) {
    // Get spectrum parameters based on current selection
    const spectrumType = document.getElementById('spectrum_type')?.value || '2';
    const groundType = document.getElementById('ground_type')?.value || 'B';
    
    if (!SPECTRUM_PARAMETERS || !SPECTRUM_PARAMETERS[spectrumType] || !SPECTRUM_PARAMETERS[spectrumType][groundType]) {
        console.error('SPECTRUM_PARAMETERS not available for plotting:', { spectrumType, groundType });
        return [];
    }
    const params = SPECTRUM_PARAMETERS[spectrumType][groundType];
    
    const data = [];
    const q = parseFloat(document.getElementById('q')?.value) || 1.5;   // Behavior factor from user input
    const TB = params.TB;
    const TC = params.TC;
    const TD = params.TD;
    
    // Generate points for smooth curve using the same calculation function
    for (let T = 0.01; T <= 4.0; T += 0.01) {
        const Sd = calculateSdAtPeriod(T, ag, S, spectrumType, groundType);
        data.push({ T: T, Sd: Sd });
    }
    
    return data;
}

// Create D3.js plot for response spectrum
function createSpectrumPlot(spectrumData, T1, Sd_T1) {
    // Clear previous plot
    d3.select("#spectrum-plot").selectAll("*").remove();
    
    // Set dimensions and margins
    const margin = { top: 20, right: 30, bottom: 40, left: 60 };
    const width = Math.min(800, window.innerWidth - 100) - margin.left - margin.right;
    const height = 400 - margin.top - margin.bottom;
    
    // Create SVG
    const svg = d3.select("#spectrum-plot")
        .append("svg")
        .attr("width", width + margin.left + margin.right)
        .attr("height", height + margin.top + margin.bottom);
    
    const g = svg.append("g")
        .attr("transform", `translate(${margin.left},${margin.top})`);
    
    // Set scales
    const xScale = d3.scaleLinear()
        .domain([0, 4])
        .range([0, width]);
    
    const yScale = d3.scaleLinear()
        .domain([0, d3.max(spectrumData, d => d.Sd) * 1.1])
        .range([height, 0]);
    
    // Create line generator
    const line = d3.line()
        .x(d => xScale(d.T))
        .y(d => yScale(d.Sd))
        .curve(d3.curveMonotoneX);
    
    // Add axes
    g.append("g")
        .attr("transform", `translate(0,${height})`)
        .call(d3.axisBottom(xScale))
        .append("text")
        .attr("x", width / 2)
        .attr("y", 35)
        .attr("fill", "#e5e7eb")
        .style("text-anchor", "middle")
        .text("Period T (s)");
    
    g.append("g")
        .call(d3.axisLeft(yScale))
        .append("text")
        .attr("transform", "rotate(-90)")
        .attr("y", -40)
        .attr("x", -height / 2)
        .attr("fill", "#e5e7eb")
        .style("text-anchor", "middle")
        .text("Sd(T) (m/s²)");
    
    // Add grid lines
    g.append("g")
        .attr("class", "grid")
        .attr("transform", `translate(0,${height})`)
        .call(d3.axisBottom(xScale)
            .tickSize(-height)
            .tickFormat("")
        )
        .style("stroke-dasharray", "3,3")
        .style("opacity", 0.3);
    
    g.append("g")
        .attr("class", "grid")
        .call(d3.axisLeft(yScale)
            .tickSize(-width)
            .tickFormat("")
        )
        .style("stroke-dasharray", "3,3")
        .style("opacity", 0.3);
    
    // Add response spectrum curve
    g.append("path")
        .datum(spectrumData)
        .attr("fill", "none")
        .attr("stroke", "#3b82f6")
        .attr("stroke-width", 2)
        .attr("d", line);
    
    // Add point for T1, Sd(T1)
    g.append("circle")
        .attr("cx", xScale(T1))
        .attr("cy", yScale(Sd_T1))
        .attr("r", 6)
        .attr("fill", "#ef4444")
        .attr("stroke", "#ffffff")
        .attr("stroke-width", 2);
    
    // Add labels for the point
    g.append("text")
        .attr("x", xScale(T1) + 10)
        .attr("y", yScale(Sd_T1) - 10)
        .attr("fill", "#ef4444")
        .style("font-weight", "bold")
        .text(`T₁=${toFixedIfNeeded(T1, 3)}s`);
    
    g.append("text")
        .attr("x", xScale(T1) + 10)
        .attr("y", yScale(Sd_T1) + 5)
        .attr("fill", "#ef4444")
        .style("font-weight", "bold")
        .text(`Sd=${toFixedIfNeeded(Sd_T1)}m/s²`);
    
    // Create tooltip
    const tooltip = d3.select("body").append("div")
        .attr("class", "tooltip")
        .style("opacity", 0)
        .style("position", "absolute")
        .style("background", "rgba(0, 0, 0, 0.8)")
        .style("color", "white")
        .style("padding", "8px")
        .style("border-radius", "4px")
        .style("font-size", "12px")
        .style("pointer-events", "none")
        .style("z-index", "1000");
    
    // Add invisible overlay for mouse tracking
    const overlay = g.append("rect")
        .attr("width", width)
        .attr("height", height)
        .attr("fill", "none")
        .attr("pointer-events", "all")
        .on("mouseover", function() {
            tooltip.style("opacity", 1);
            crosshair.style("opacity", 1);
        })
        .on("mouseout", function() {
            tooltip.style("opacity", 0);
            crosshair.style("opacity", 0);
        })
        .on("mousemove", function(event) {
            const [mouseX, mouseY] = d3.pointer(event);
            const T = xScale.invert(mouseX);
            
            // Calculate Sd(T) for this period
            const spectrumType = document.getElementById('spectrum_type').value;
            const groundType = document.getElementById('ground_type').value;
            const ag = parseFloat(document.getElementById('ag_display').textContent);
            const S = parseFloat(document.getElementById('S').value);
            const SdAtT = calculateSdAtPeriod(T, ag, S, spectrumType, groundType);
            
            // Update crosshair position
            crosshair.select(".crosshair-x")
                .attr("y1", yScale(SdAtT))
                .attr("y2", height);
            crosshair.select(".crosshair-y")
                .attr("x1", 0)
                .attr("x2", mouseX);
            crosshair.select(".crosshair-circle")
                .attr("cx", mouseX)
                .attr("cy", yScale(SdAtT));
            
            // Update tooltip
            tooltip
                .style("left", (event.pageX + 10) + "px")
                .style("top", (event.pageY - 10) + "px")
                .html(`<strong>T = ${T.toFixed(3)} s</strong><br/>Sd(T) = ${SdAtT.toFixed(3)} m/s²`);
        });
    
    // Add crosshair group
    const crosshair = g.append("g")
        .attr("class", "crosshair")
        .style("opacity", 0);
    
    crosshair.append("line")
        .attr("class", "crosshair-x")
        .attr("x1", 0)
        .attr("x2", 0)
        .attr("stroke", "#ff6b6b")
        .attr("stroke-width", 1)
        .attr("stroke-dasharray", "3,3");
    
    crosshair.append("line")
        .attr("class", "crosshair-y")
        .attr("y1", 0)
        .attr("y2", 0)
        .attr("stroke", "#ff6b6b")
        .attr("stroke-width", 1)
        .attr("stroke-dasharray", "3,3");
    
    crosshair.append("circle")
        .attr("class", "crosshair-circle")
        .attr("r", 4)
        .attr("fill", "#ff6b6b")
        .attr("stroke", "white")
        .attr("stroke-width", 2);
    
    // Add title
    g.append("text")
        .attr("x", width / 2)
        .attr("y", -5)
        .attr("fill", "#e5e7eb")
        .style("text-anchor", "middle")
        .style("font-weight", "bold")
        .text("EC8 Elastic Response Spectrum - Hover for Sd(T) values");
}

// Main seismic calculation function
function calculateSeismic() {
    try {
        // Get input values
        const place = document.getElementById('place').value.trim();
        const seismicClass = document.getElementById('seismic_class').value;
        const spectrumType = document.getElementById('spectrum_type').value;
        const structureLife = parseFloat(document.getElementById('structure_life').value);
        const gammaI = parseFloat(document.getElementById('gamma_I').value);
        const groundType = document.getElementById('ground_type').value;
        const agr = parseFloat(document.getElementById('agr').value);
        const S = parseFloat(document.getElementById('S').value);
        const sdMethod = document.getElementById('sd_method').value;
        
        // Calculate basic seismic parameters
        const ag = agr * gammaI;
        const agS = ag * S;
        
        // Calculate Sd
        let Sd, T1;
        if (sdMethod === 'manual') {
            Sd = parseFloat(document.getElementById('sd_manual').value) || 0;
            T1 = 1.0; // Default for plotting
        } else {
            const h = parseFloat(document.getElementById('h').value);
            const ct = parseFloat(document.getElementById('ct').value);
            T1 = ct * Math.pow(h, 0.75);
            Sd = calculateSd(T1, ag, S);
        }
        
        // Check seismic design requirements
        const requirements = checkSeismicRequirements(seismicClass, groundType, agS, ag, structureLife, Sd);
        
        // Generate spectrum data for plotting
        const spectrumData = generateSpectrumData(ag, S);
        
        // Display results
        displaySeismicResults({
            place, seismicClass, spectrumType, structureLife, gammaI, groundType, agr, S, ag, agS,
            sdMethod, T1, Sd, requirements, spectrumData
        });
        
    } catch (error) {
        alert('Calculation failed: ' + error.message);
    }
}

// Check if seismic design is required according to EC8
function checkSeismicRequirements(seismicClass, groundType, agS, ag, structureLife, Sd) {
    const checks = [];
    let designRequired = true;
    let passedCriteria = [];
    let failedCriteria = [];
    
    // Check 1: Seismic class I
    const check1 = {
        condition: "Seismic class = I",
        criterion: "Class I structures"
    };
    if (seismicClass === 'I') {
        check1.result = "❌ No seismic design required";
        check1.passes = true;
        designRequired = false;
        passedCriteria.push("Seismic class I");
    } else {
        check1.result = `✓ Class ${seismicClass} (design may be required)`;
        check1.passes = false;
        failedCriteria.push("Seismic class ≠ I");
    }
    checks.push(check1);
    
    // Check 2: agS ≤ 0.5 m/s² for ground types A-E
    const check2 = {
        condition: "Ground type A-E and agS ≤ 0.5 m/s²",
        criterion: "Low soil-amplified acceleration"
    };
    if (['A', 'B', 'C', 'D', 'E'].includes(groundType) && agS <= 0.5) {
        check2.result = `❌ agS = ${toFixedIfNeeded(agS)} ≤ 0.5 m/s²`;
        check2.passes = true;
        if (designRequired) {
            designRequired = false;
            passedCriteria.push("agS ≤ 0.5 m/s²");
        }
    } else {
        check2.result = `✓ agS = ${toFixedIfNeeded(agS)} > 0.5 m/s² (design may be required)`;
        check2.passes = false;
        failedCriteria.push("agS > 0.5 m/s²");
    }
    checks.push(check2);
    
    // Check 3: ag ≤ 0.3 m/s² for ground types A-E
    const check3 = {
        condition: "Ground type A-E and ag ≤ 0.3 m/s²",
        criterion: "Low ground acceleration"
    };
    if (['A', 'B', 'C', 'D', 'E'].includes(groundType) && ag <= 0.3) {
        check3.result = `❌ ag = ${toFixedIfNeeded(ag)} ≤ 0.3 m/s²`;
        check3.passes = true;
        if (designRequired) {
            designRequired = false;
            passedCriteria.push("ag ≤ 0.3 m/s²");
        }
    } else {
        check3.result = `✓ ag = ${toFixedIfNeeded(ag)} > 0.3 m/s² (design may be required)`;
        check3.passes = false;
        failedCriteria.push("ag > 0.3 m/s²");
    }
    checks.push(check3);
    
    // Check 4: Structure life ≤ 2 years
    const check4 = {
        condition: "Structure life ≤ 2 years",
        criterion: "Temporary structure"
    };
    if (structureLife <= 2) {
        check4.result = `❌ Life = ${structureLife} years ≤ 2`;
        check4.passes = true;
        if (designRequired) {
            designRequired = false;
            passedCriteria.push("Structure life ≤ 2 years");
        }
    } else {
        check4.result = `✓ Life = ${structureLife} years > 2 (design may be required)`;
        check4.passes = false;
        failedCriteria.push("Structure life > 2 years");
    }
    checks.push(check4);
    
    // Check 5: Sd ≤ 0.5 m/s² (only if Sd > 0 and not empty)
    const check5 = {
        condition: "Sd ≤ 0.5 m/s²",
        criterion: "Low spectral acceleration"
    };
    if (Sd === 0 || isNaN(Sd) || Sd === null || Sd === undefined) {
        check5.result = `⚠️ Sd = ${Sd || 0} (not evaluated)`;
        check5.passes = null; // Neither passes nor fails
        check5.ignored = true;
    } else if (Sd <= 0.5) {
        check5.result = `❌ Sd = ${toFixedIfNeeded(Sd)} ≤ 0.5 m/s²`;
        check5.passes = true;
        if (designRequired) {
            designRequired = false;
            passedCriteria.push("Sd ≤ 0.5 m/s²");
        }
    } else {
        check5.result = `✓ Sd = ${toFixedIfNeeded(Sd)} > 0.5 m/s² (design may be required)`;
        check5.passes = false;
        failedCriteria.push("Sd > 0.5 m/s²");
    }
    checks.push(check5);
    
    return {
        designRequired,
        passedCriteria,
        failedCriteria,
        checks
    };
}

// Display seismic results
function displaySeismicResults(data) {
    // Update summary
    const requirementResult = document.getElementById('requirement-result');
    const summaryDetails = document.getElementById('summary-details');
    
    if (data.requirements.designRequired) {
        requirementResult.innerHTML = '<span class="text-red-400 text-2xl">⚠️ SEISMIC DESIGN REQUIRED</span>';
        requirementResult.className = 'text-lg font-bold mb-4 p-4 bg-red-900/30 border border-red-500 rounded';
    } else {
        requirementResult.innerHTML = '<span class="text-green-400 text-2xl">✅ NO SEISMIC DESIGN REQUIRED</span>';
        requirementResult.className = 'text-lg font-bold mb-4 p-4 bg-green-900/30 border border-green-500 rounded';
    }
    
    // Add criteria summary
    let criteriaSummary = '';
    if (data.requirements.passedCriteria.length > 0) {
        criteriaSummary += `<p class="text-sm mt-2 text-green-300">✅ <strong>Avoidance criteria met:</strong> ${data.requirements.passedCriteria.join(', ')}</p>`;
    }
    if (data.requirements.failedCriteria.length > 0) {
        criteriaSummary += `<p class="text-sm mt-1 text-red-300">❗ <strong>Criteria requiring design:</strong> ${data.requirements.failedCriteria.join(', ')}</p>`;
    }
    requirementResult.innerHTML += criteriaSummary;
    
    // Summary details
    const spectrumType = document.getElementById('spectrum_type').value;
    summaryDetails.innerHTML = `
        <div>
            <h4 class="font-semibold text-blue-400 mb-2">Location & Parameters</h4>
            <p><span class="text-gray-300">Place:</span> <span class="font-mono text-white">${data.place}</span></p>
            <p><span class="text-gray-300">Seismic Class:</span> <span class="font-mono text-white">${data.seismicClass}</span></p>
            <p><span class="text-gray-300">Spectrum Type:</span> <span class="font-mono text-white">Type ${spectrumType}${spectrumType === '2' ? ' (Norway)' : ''}</span></p>
            <p><span class="text-gray-300">Ground Type:</span> <span class="font-mono text-white">${data.groundType}</span></p>
            <p><span class="text-gray-300">Structure Life:</span> <span class="font-mono text-white">${data.structureLife} years</span></p>
        </div>
        <div>
            <h4 class="font-semibold text-yellow-400 mb-2">Calculated Values</h4>
            <p><span class="text-gray-300">ag:</span> <span class="font-mono text-white">${toFixedIfNeeded(data.ag)} m/s²</span></p>
            <p><span class="text-gray-300">ag·S:</span> <span class="font-mono text-white">${toFixedIfNeeded(data.agS)} m/s²</span></p>
            ${data.sdMethod === 'simplified' ? 
                `<p><span class="text-gray-300">T₁:</span> <span class="font-mono text-white">${toFixedIfNeeded(data.T1, 3)} s</span></p>` : 
                ''}
            <p><span class="text-gray-300">Sd:</span> <span class="font-mono text-white">${toFixedIfNeeded(data.Sd)} m/s²</span></p>
        </div>
    `;
    
    // Create spectrum plot (always show the design spectrum)
    createSpectrumPlot(data.spectrumData, data.T1, data.Sd);
    
    // Add note about manual vs calculated Sd
    const spectrumNote = document.querySelector('#spectrum-plot-container .spectrum-note');
    if (spectrumNote) spectrumNote.remove();
    
    if (data.sdMethod === 'manual') {
        const noteDiv = document.createElement('div');
        noteDiv.className = 'spectrum-note mt-2 text-sm text-yellow-400';
        noteDiv.innerHTML = '📝 <strong>Note:</strong> Design spectrum shown with manual Sd input marked. Hover over spectrum for Sd(T) at any period.';
        document.getElementById('spectrum-plot-container').appendChild(noteDiv);
    } else {
        const noteDiv = document.createElement('div');
        noteDiv.className = 'spectrum-note mt-2 text-sm text-gray-400';
        noteDiv.innerHTML = '🎯 <strong>Calculated:</strong> T₁ and Sd(T₁) calculated from simplified method. Hover for Sd(T) at any period.';
        document.getElementById('spectrum-plot-container').appendChild(noteDiv);
    }
    
    // Detailed calculations
    const calcSteps = document.getElementById('calc-steps');
    calcSteps.innerHTML = createDetailedCalculations(data);
    
    // Show results
    document.getElementById('results').style.display = 'block';
    document.getElementById('print-btn').style.display = 'block';
    
    // Scroll to results
    document.getElementById('results').scrollIntoView({
        behavior: 'smooth',
        block: 'start'
    });
}

// Create detailed calculations HTML
function createDetailedCalculations(data) {
    const spectrumType = document.getElementById('spectrum_type').value;
    const groundType = document.getElementById('ground_type').value;
    const params = SPECTRUM_PARAMETERS[spectrumType][groundType];
    
    return `
        <!-- Response Spectrum Parameters -->
        <div class="calc-box mb-6">
            <div class="calc-header">
                <h3 class="text-lg font-semibold text-purple-300">Response Spectrum Parameters</h3>
            </div>
            <div class="calc-content">
                <div class="calc-row">
                    <span class="calc-label">Spectrum Type</span>
                    <span class="calc-equals">=</span>
                    <span class="calc-value">Type ${spectrumType} ${spectrumType === '2' ? '(Recommended for Norway)' : ''}</span>
                </div>
                <div class="calc-row">
                    <span class="calc-label">Ground Type</span>
                    <span class="calc-equals">=</span>
                    <span class="calc-value">${groundType}</span>
                </div>
                <div class="calc-row">
                    <span class="calc-label">T<sub>B</sub></span>
                    <span class="calc-equals">=</span>
                    <span class="calc-value">${toFixedIfNeeded(params.TB, 3)} s</span>
                    <span class="calc-label ml-6">T<sub>C</sub></span>
                    <span class="calc-equals">=</span>
                    <span class="calc-value">${toFixedIfNeeded(params.TC, 3)} s</span>
                    <span class="calc-label ml-6">T<sub>D</sub></span>
                    <span class="calc-equals">=</span>
                    <span class="calc-value">${toFixedIfNeeded(params.TD, 1)} s</span>
                </div>
            </div>
        </div>
        
        <!-- Basic Calculations -->
        <div class="calc-box mb-6">
            <div class="calc-header">
                <h3 class="text-lg font-semibold text-blue-300">Basic Seismic Parameters</h3>
            </div>
            <div class="calc-content">
                <div class="calc-row">
                    <span class="calc-label">S (Soil Factor)</span>
                    <span class="calc-equals">=</span>
                    <span class="calc-expression">From Table 3.${spectrumType === '1' ? '2' : '3'} for ground type ${groundType}</span>
                    <span class="calc-equals">=</span>
                    <span class="calc-value">${toFixedIfNeeded(data.S)}</span>
                </div>
                <div class="calc-row">
                    <span class="calc-label">a<sub>g</sub></span>
                    <span class="calc-equals">=</span>
                    <span class="calc-expression">a<sub>gR</sub> × γ<sub>I</sub> = ${toFixedIfNeeded(data.agr)} × ${toFixedIfNeeded(data.gammaI)}</span>
                    <span class="calc-equals">=</span>
                    <span class="calc-value">${toFixedIfNeeded(data.ag)} m/s²</span>
                </div>
                <div class="calc-row">
                    <span class="calc-label">a<sub>g</sub>·S</span>
                    <span class="calc-equals">=</span>
                    <span class="calc-expression">${toFixedIfNeeded(data.ag)} × ${toFixedIfNeeded(data.S)}</span>
                    <span class="calc-equals">=</span>
                    <span class="calc-value">${toFixedIfNeeded(data.agS)} m/s²</span>
                </div>
            </div>
        </div>
        
        ${data.sdMethod === 'simplified' ? `
        <!-- Period Calculation -->
        <div class="calc-box mb-6">
            <div class="calc-header">
                <h3 class="text-lg font-semibold text-yellow-300">First Mode Period (Simplified Method)</h3>
            </div>
            <div class="calc-content">
                <div class="calc-row">
                    <span class="calc-label">T<sub>1</sub></span>
                    <span class="calc-equals">=</span>
                    <span class="calc-expression">C<sub>t</sub> × h<sup>3/4</sup> = ${toFixedIfNeeded(parseFloat(document.getElementById('ct').value), 3)} × ${data.structureLife !== undefined ? parseFloat(document.getElementById('h').value) : 20}<sup>3/4</sup></span>
                    <span class="calc-equals">=</span>
                    <span class="calc-value">${toFixedIfNeeded(data.T1, 3)} s</span>
                </div>
                <div class="calc-row">
                    <span class="calc-label">S<sub>d</sub>(T<sub>1</sub>)</span>
                    <span class="calc-equals">=</span>
                    <span class="calc-expression">From response spectrum</span>
                    <span class="calc-equals">=</span>
                    <span class="calc-value">${toFixedIfNeeded(data.Sd)} m/s²</span>
                </div>
            </div>
        </div>` : ''}
        
        <!-- Avoidance Criteria Check -->
        <div class="calc-box mb-6">
            <div class="calc-header">
                <h3 class="text-lg font-semibold text-red-300">Seismic Design Avoidance Criteria</h3>
            </div>
            <div class="calc-content">
                <div class="text-sm text-gray-300 mb-4">
                    Seismic design is NOT required if ANY of the following conditions are met:
                </div>
                ${data.requirements.checks.map((check, index) => `
                    <div class="calc-row ${check.ignored ? 'bg-yellow-900/20' : check.passes ? 'bg-green-900/20' : 'bg-red-900/20'} rounded p-2 mb-2">
                        <span class="calc-label text-sm">${index + 1}. ${check.condition}</span>
                        <span class="calc-value text-sm">${check.result}</span>
                    </div>
                `).join('')}
                
                <div class="calc-separator mt-4"></div>
                <div class="calc-row">
                    <span class="calc-label text-xl font-bold">Result</span>
                    <span class="calc-value text-xl font-bold ${data.requirements.designRequired ? 'text-red-400' : 'text-green-400'}">
                        ${data.requirements.designRequired ? 'SEISMIC DESIGN REQUIRED' : 'NO SEISMIC DESIGN REQUIRED'}
                    </span>
                </div>
            </div>
        </div>
    `;
}

// Initialize when page loads
document.addEventListener('DOMContentLoaded', function() {
    console.log('Initializing seismic calculator...');
    console.log('SPECTRUM_PARAMETERS available:', !!SPECTRUM_PARAMETERS);
    
    // Initialize all parameter updates
    updateGammaI();
    updateSpectrumParameters();
    updateCt();
    toggleSdMethod();
    
    // Add event listeners for real-time updates
    ['agr', 'gamma_I', 'h', 'ct', 'sd_manual', 'q'].forEach(id => {
        const element = document.getElementById(id);
        if (element) {
            console.log('Adding input listener for:', id);
            element.addEventListener('input', updateCalculatedValues);
        }
    });
    
    // Add event listeners for dropdown changes with debugging
    const dropdownUpdates = [
        { id: 'seismic_class', handler: updateGammaI, description: 'seismic class -> gamma_I' },
        { id: 'spectrum_type', handler: updateSpectrumParameters, description: 'spectrum type -> S, TB, TC, TD' },
        { id: 'ground_type', handler: updateSpectrumParameters, description: 'ground type -> S, TB, TC, TD' },
        { id: 'ct_method', handler: updateCt, description: 'ct method -> Ct' },
        { id: 'sd_method', handler: toggleSdMethod, description: 'sd method -> show/hide inputs' },
        { id: 'country', handler: handleCountryChange, description: 'country -> show/hide input methods' },
        { id: 'fylke', handler: handleFylkeChange, description: 'fylke -> populate kommune options' },
        { id: 'kommune', handler: handleKommuneChange, description: 'kommune -> update agR from CSV' }
    ];
    
    // Add listeners for numeric inputs that affect calculations
    const numericInputUpdates = [
        { id: 'q', handler: updateCalculatedValues, description: 'behavior factor -> recalculate Sd' },
        { id: 'agr', handler: updateCalculatedValues, description: 'agR -> ag and calculations' },
        { id: 'gamma_I', handler: updateCalculatedValues, description: 'gamma_I -> ag calculation' },
        { id: 'h', handler: updateCalculatedValues, description: 'height -> T1 calculation' },
        { id: 'ct', handler: updateCalculatedValues, description: 'Ct -> T1 calculation' }
    ];
    
    dropdownUpdates.forEach(({ id, handler, description }) => {
        const element = document.getElementById(id);
        if (element) {
            console.log(`Adding change listener for ${id}: ${description}`);
            element.addEventListener('change', function(event) {
                console.log(`${id} changed to:`, event.target.value);
                handler();
            });
        } else {
            console.warn(`Element not found: ${id}`);
        }
    });
    
    // Add event listeners for numeric inputs
    numericInputUpdates.forEach(({ id, handler, description }) => {
        const element = document.getElementById(id);
        if (element) {
            console.log(`Adding input listener for ${id}: ${description}`);
            element.addEventListener('input', function(event) {
                console.log(`${id} changed to:`, event.target.value);
                handler();
            });
        } else {
            console.warn(`Numeric input element not found: ${id}`);
        }
    });
    
    // Initial calculation
    updateCalculatedValues();
    
    console.log('Seismic calculator initialized successfully');
});