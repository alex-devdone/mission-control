export interface TeamDefinition {
  key: string;
  title: string;
  members: string[];
}

export const TEAM_DEFINITIONS: TeamDefinition[] = [
  {
    key: 'mission-control',
    title: 'Mission Control',
    members: ['Team Lead Betty', 'Developer', 'Middle Developer', 'Codex Developer', 'QA', 'mcDesigner'],
  },
  {
    key: 'dev-team',
    title: 'Dev Team',
    members: ['Junior Developer', 'BettyDev', 'betty99dev', 'Mobile Dev'],
  },
  {
    key: 'qa-design',
    title: 'QA & Design',
    members: ['betty99qa'],
  },
  {
    key: 'leadership',
    title: 'Leadership',
    members: ['Researcher'],
  },
  {
    key: 'personal-assistants',
    title: 'Personal Assistants',
    members: ['Betty99bot', 'Betty99Shopping', 'betty99coach', 'betty99budget', 'betty99events', 'betty99doctor'],
  },
  {
    key: 'ops',
    title: 'Ops',
    members: ['bettydevops', 'devops'],
  },
];
