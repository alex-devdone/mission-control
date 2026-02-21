export interface TeamDefinition {
  key: string;
  title: string;
  members: string[];
}

export const TEAM_DEFINITIONS: TeamDefinition[] = [
  {
    key: 'dev-team',
    title: 'Dev Team',
    members: ['Developer', 'Middle Developer', 'Codex Developer', 'Junior Developer', 'BettyDev', 'betty99dev', 'Mobile Dev'],
  },
  {
    key: 'qa-design',
    title: 'QA & Design',
    members: ['QA', 'betty99qa', 'Designer'],
  },
  {
    key: 'leadership',
    title: 'Leadership',
    members: ['Team Lead Betty', 'Researcher'],
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
