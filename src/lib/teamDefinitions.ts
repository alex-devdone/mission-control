export interface TeamDefinition {
  key: string;
  title: string;
  members: string[];
}

export const TEAM_DEFINITIONS: TeamDefinition[] = [
  {
    key: 'mission-control',
    title: 'Mission Control',
    members: ['Team Lead Betty', 'Middle Developer', 'Codex Developer', 'QA', 'mcDesigner', 'mcResearcher', 'mcMobileDev'],
  },
  {
    key: 'personal-assistants',
    title: 'Personal Assistants',
    members: ['Betty99bot', 'Betty99Shopping', 'betty99coach', 'betty99budget', 'betty99events', 'betty99doctor', 'betty99dev', 'bettydevops', 'BettyDevOps'],
  },
];
