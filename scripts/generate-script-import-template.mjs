import fs from "node:fs";
import path from "node:path";
import XLSX from "xlsx";

const wb = XLSX.utils.book_new();

const scripts = [
  ["script_code", "script_name", "machine_type", "active"],
  ["EXC_BASIC_01", "Багер - първи разговор", "excavator", 1],
  ["EXC_FOLLOWUP_01", "Багер - follow-up", "excavator", 1],
  ["GLASS_BASIC_01", "Стъклоповдигач - първи разговор", "glass_lifter", 1],
  ["GLASS_FOLLOWUP_01", "Стъклоповдигач - follow-up", "glass_lifter", 1],
  ["FLOOR_BASIC_01", "Подопочистваща - първи разговор", "floor_cleaner", 1],
  ["FLOOR_FOLLOWUP_01", "Подопочистваща - follow-up", "floor_cleaner", 1],
];

const scriptSteps = [
  ["script_code", "step_no", "step_type", "question", "answer_type", "required"],
  ["EXC_BASIC_01", 1, "question", "Какъв тип обект обслужвате?", "text", 1],
  ["EXC_BASIC_01", 2, "question", "Какъв бюджет сте планирали (EUR)?", "number", 1],
  ["EXC_BASIC_01", 3, "question", "До кога ви е необходима машината?", "date", 1],
  ["EXC_BASIC_01", 4, "question", "Нуждаете ли се от лизинг?", "yes_no", 0],
  ["EXC_BASIC_01", 5, "selling_point", "Ние предлагаме 2-годишна гаранция и сервизна мрежа в цяла България.", "text", 0],
  ["EXC_FOLLOWUP_01", 1, "question", "Кой взема окончателното решение за покупка?", "text", 1],
  ["EXC_FOLLOWUP_01", 2, "question", "Имате ли предпочитан модел/марка?", "choice", 0],
  ["GLASS_BASIC_01", 1, "question", "Каква е максималната височина на обектите?", "number", 1],
  ["GLASS_BASIC_01", 2, "question", "Какъв е средният товар (кг)?", "number", 1],
  ["GLASS_BASIC_01", 3, "selling_point", "Осигуряваме обучение на екипа при доставка.", "text", 0],
  ["GLASS_FOLLOWUP_01", 1, "question", "Имате ли нужда от демонстрация на място?", "yes_no", 1],
  ["FLOOR_BASIC_01", 1, "question", "Каква площ почиствате дневно (кв.м)?", "number", 1],
  ["FLOOR_BASIC_01", 2, "question", "Имате ли изискване за нисък шум?", "yes_no", 0],
  ["FLOOR_BASIC_01", 3, "selling_point", "Ниски експлоатационни разходи и бърза доставка на консумативи.", "text", 0],
  ["FLOOR_FOLLOWUP_01", 1, "question", "Кога можем да направим тест на машината?", "date", 1],
];

const machineInfo = [
  ["machine_code", "machine_type", "model_name", "price_eur", "specs", "features", "active"],
  ["EXC_001", "excavator", "XCMG XE80", 68500, "8t; 45kW; кофа 0.32m3", "Quick coupler; LED lights", 1],
  ["EXC_002", "excavator", "XCMG XE135", 96500, "13.5t; 72kW; кофа 0.55m3", "Камера; Auto-idle", 1],
  ["GLS_001", "glass_lifter", "G-Lift 800", 24900, "Товар 800кг; височина 4.5м", "Вакуумна система; дистанционно", 1],
  ["GLS_002", "glass_lifter", "G-Lift 1200", 31900, "Товар 1200кг; височина 6.0м", "4x4 шаси; прецизно позициониране", 1],
  ["FLR_001", "floor_cleaner", "FloorPro 65", 12900, "Работна ширина 65см; резервоар 80л", "Eco режим; бърза смяна на четки", 1],
  ["FLR_002", "floor_cleaner", "FloorPro 85", 16900, "Работна ширина 85см; резервоар 120л", "Тракшън; телеметрия", 1],
];

const sellingPoints = [
  ["machine_type", "priority", "text", "active"],
  ["excavator", 1, "2-годишна гаранция и сервизна мрежа в цяла България.", 1],
  ["excavator", 2, "Налични резервни части с бърза доставка.", 1],
  ["glass_lifter", 1, "Обучение на оператори при внедряване.", 1],
  ["glass_lifter", 2, "Безопасно позициониране на стъклопакети с минимален риск.", 1],
  ["floor_cleaner", 1, "Нисък разход на вода и препарати.", 1],
  ["floor_cleaner", 2, "Сервиз и консумативи от склад в България.", 1],
];

XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(scripts), "scripts");
XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(scriptSteps), "script_steps");
XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(machineInfo), "machine_info");
XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(sellingPoints), "selling_points");

const outDir = path.join("c:/dev/klienti", "outputs");
if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });
const outPath = path.join(outDir, "script_import_template.xlsx");
XLSX.writeFile(wb, outPath);
console.log(outPath);
