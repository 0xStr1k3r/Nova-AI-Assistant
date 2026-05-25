export interface SubTask {
  id: string;
  title: string;
  prompt: string;
  dependencies: string[];
}

export interface AgentAction {
  name: string;
  args: any;
}
