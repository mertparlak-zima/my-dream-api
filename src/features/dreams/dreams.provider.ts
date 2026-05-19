export type DreamProviderInterpreter = {
  id: string;
  name: string;
  systemPrompt: string;
};

export type DreamProviderModel = {
  openrouterModelId: string;
};

export type DreamInterpretationRequest = {
  dreamId: string;
  userId: string;
  content: string;
  interpreter: DreamProviderInterpreter;
  model: DreamProviderModel;
};

export type DreamInterpretationResult = {
  interpretation: string;
};

export type DreamInterpretationProvider = {
  interpret(request: DreamInterpretationRequest): Promise<DreamInterpretationResult>;
};
