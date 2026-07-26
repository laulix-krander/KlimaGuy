type ProjectFormErrorProps = {
  error?: string;
};

type ProjectFieldErrorProps = {
  error?: string;
  id: string;
};

export function ProjectFormError({ error }: ProjectFormErrorProps) {
  if (!error) return null;

  return (
    <div className="rounded border border-red-200 bg-red-50 p-3 text-sm text-red-800" role="alert">
      {error}
    </div>
  );
}

export function ProjectFieldError({ error, id }: ProjectFieldErrorProps) {
  if (!error) return null;

  return (
    <p id={id} className="text-sm text-red-700">
      {error}
    </p>
  );
}

export function firstProjectFieldError(
  state: { success: boolean; fieldErrors?: Record<string, string[]> },
  field: string,
): string | undefined {
  return state.success ? undefined : state.fieldErrors?.[field]?.[0];
}
