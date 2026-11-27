import { useTranslations } from "next-intl";

const ExamInstruction = () => {
  const t = useTranslations("examInstruction");

  return (
    <div className={`vFlex justify-start items-start gap-2 text-sm`}>
      <h1 className={`font-bold`}>{t("heading")}</h1>

      <ul className={`text-gray-500 list-disc ps-8`}>
        <li>{t("instruction1")}</li>
        <li>{t("instruction2")}</li>
        <li>{t("instruction3")}</li>
        <li>{t("instruction4")}</li>
        <li>{t("instruction5")}</li>
      </ul>
    </div>
  );
};

export default ExamInstruction;
