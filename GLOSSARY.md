# Partyman

Partyman records LAN parties: who came, what was played, who won what, and who earned the glory. It keeps the history of every gathering and drives the screen everyone watches while the party happens.

## The party

**Party**:
A single gathering. Everything else in Partyman belongs to one. At most one Party is active at a time.
_Avoid_: event, session

**Participant**:
A person Partyman knows by a stable Steam identity, carried across every Party they ever attend. A Participant exists before they join anything.
_Avoid_: user, player

**Member**:
A Participant who has joined a Party. Membership is what puts someone in that Party's numbers.
_Avoid_: attendance, attendee, registration

**Admin**:
A Member who also gets to run things — creating Parties, Games, Tournaments and Rewards, correcting results and taking backups. An Admin can arrive either by signing in with Steam or by username and password; that second door exists for when Steam is unavailable, not because it is a different kind of person.
_Avoid_: operator, user, moderator, owner

## Playing

**Game**:
Something worth playing, configured once and available to every Party afterwards.
_Avoid_: title (that is a Game's name, not the Game)

**Activity**:
A scheduled stretch of play inside a Party, optionally around a Game. Whether it is upcoming, current or past follows from its start and end times, not from anything an Admin does. An Admin may override that when the clock is wrong — finishing or cancelling an Activity by hand, or reopening one — and the override sticks.
_Avoid_: session, event, match

**Tournament**:
A competition among Members of one Game, decided through a set of Matches.
_Avoid_: bracket (that is one view of a Tournament), cup, league

**Match**:
One contest between two Members inside a Tournament, always with exactly one winner. Its Score is optional; who won is not.
_Avoid_: game (a Match is not the Game being played)

**Report**:
A Member's claim that they won a Match. When two Members report opposite winners for the same Match, it becomes a Dispute.
_Avoid_: score submission, result entry

**Dispute**:
A Match whose Members disagree, settled by a vote of the other Members in that Tournament.
_Avoid_: complaint, appeal

## Deciding

**Proposal**:
A Member's suggestion that a Party run something, either an Activity or a Tournament. Members back a Proposal with one yes each; enough yeses and it happens without an Admin lifting a finger.
_Avoid_: request, suggestion, poll

**Vote**:
A Member's single yes on a Proposal, or their side in a Dispute. Voting again changes a Member's mind; it never adds a second ballot.
_Avoid_: ballot, endorsement

## Standing

**Score**:
How a Match went — the scoreline a Report carries. A Match can be won without one.
_Avoid_: points

**Points**:
Partyman's currency, earned for turning up, playing and winning. Points accumulate per Party and across all of them.
_Avoid_: score

**Leaderboard**:
Members ranked by Points, shown for one Party and for all of them.
_Avoid_: ranking, standings

**Reward**:
A mark of recognition handed to a Member for something they did, taken from the catalogue or written on the spot by an Admin. A Member can earn the same Reward at more than one Party.
_Avoid_: achievement, award, trophy, prize

**Public display**:
The always-on screen showing the active Party to anyone on the LAN, with no sign-in and nothing private on it.
_Avoid_: kiosk, TV mode, dashboard