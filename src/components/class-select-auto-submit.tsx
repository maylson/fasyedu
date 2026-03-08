"use client";

type ClassOption = {
  id: string;
  name: string;
};

type ClassSelectAutoSubmitProps = {
  name: string;
  defaultValue: string;
  options: ClassOption[];
  className?: string;
  placeholder?: string;
  loadingTargetId?: string;
};

export function ClassSelectAutoSubmit({
  name,
  defaultValue,
  options,
  className,
  placeholder,
  loadingTargetId,
}: ClassSelectAutoSubmitProps) {
  return (
    <select
      name={name}
      defaultValue={defaultValue}
      className={className}
      onChange={(event) => {
        if (loadingTargetId) {
          const target = document.getElementById(loadingTargetId);
          if (target) {
            target.setAttribute("data-loading", "true");
            const overlay = target.querySelector<HTMLElement>("[data-loading-overlay]");
            overlay?.classList.remove("hidden");
          }
        }
        event.currentTarget.form?.requestSubmit();
      }}
    >
      {placeholder ? (
        <option value="">
          {placeholder}
        </option>
      ) : null}
      {options.map((item) => (
        <option key={item.id} value={item.id}>
          {item.name}
        </option>
      ))}
    </select>
  );
}
