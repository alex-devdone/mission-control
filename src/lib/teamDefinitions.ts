export interface TeamDefinition {
  key: string;
  title: string;
  members: string[];
}

export const TEAM_DEFINITIONS: TeamDefinition[] = [
  {
    key: 'mission-control',
    title: 'Mission Control',
    members: ['Team Lead Betty', 'Middle Developer', 'Codex Developer', 'QA', 'mcDesigner', 'mcResearcher'],
  },
  {
    key: 'dev-team',
    title: 'Dev Team',
    members: ['betty99dev', 'Mobile Dev'],
  },
  {
    key: 'personal-assistants',
    title: 'Personal Assistants',
    members: ['Betty99bot', 'Betty99Shopping', 'betty99coach', 'betty99budget', 'betty99events', 'betty99doctor'],
  },
  {
    key: 'ops',
    title: 'Ops',
    members: ['bettydevops'],
  },
];
