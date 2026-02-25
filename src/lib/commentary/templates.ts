// ============================================================================
// GridBlitz - Fallback Commentary Templates
// ============================================================================
// Broadcast-quality commentary templates for when Claude API is unavailable.
// Organized by play type x excitement level x game situation.
// Written to sound like Tony Romo / Jim Nantz-caliber NFL broadcasts.
// ============================================================================

import type { PlayResult, GameState, CrowdReaction } from '../simulation/types';

// ============================================================================
// TYPES
// ============================================================================

export interface CommentaryTemplate {
  /** Play-by-play call with template variables: {playerName}, {yards}, etc. */
  playByPlay: string;
  /** Color analyst commentary with template variables. */
  colorAnalysis: string;
  crowdReaction: CrowdReaction;
}

type ExcitementLevel = 'low' | 'medium' | 'high';

interface TemplateCategory {
  low: CommentaryTemplate[];
  medium: CommentaryTemplate[];
  high: CommentaryTemplate[];
}

// ============================================================================
// TEMPLATE DATABASE
// ============================================================================

// ---------------------------------------------------------------------------
// RUN PLAYS
// ---------------------------------------------------------------------------

const RUN_TEMPLATES: TemplateCategory = {
  low: [
    { playByPlay: '{down} and {distance}. {rusher} carries for {yards} yards.', colorAnalysis: "{teamName} keeping it on the ground. That's solid.", crowdReaction: 'murmur' },
    { playByPlay: '{rusher} up the middle for {yards}. {downResult}', colorAnalysis: '{teamName} grinding it out with the run game.', crowdReaction: 'murmur' },
    { playByPlay: '{rusher} takes the handoff, gains {yards}.', colorAnalysis: "He's picking up what the {teamName} offensive line gives him.", crowdReaction: 'murmur' },
    { playByPlay: '{down} and {distance}. {rusher} off right tackle for {yards} yards.', colorAnalysis: 'Good push up front by the {teamName} o-line.', crowdReaction: 'murmur' },
    { playByPlay: 'Handoff to {rusher}, {yards} yards on the carry. {downResult}', colorAnalysis: "{teamName} just keeps grinding. That's football.", crowdReaction: 'murmur' },
    { playByPlay: '{rusher} hits the hole for {yards}.', colorAnalysis: '{defTeamName} defense needs to shore up the run gaps.', crowdReaction: 'murmur' },
    { playByPlay: '{rusher} plunges ahead for {yards} yards. {downResult}', colorAnalysis: "He got what was blocked. That's all you can ask.", crowdReaction: 'murmur' },
    { playByPlay: '{down} and {distance}. {rusher} gets {yards} on the ground.', colorAnalysis: '{teamName} establishing the run early. Smart game plan.', crowdReaction: 'murmur' },
    { playByPlay: '{rusher} between the tackles for {yards}. {downResult}', colorAnalysis: 'Good patience by {rusher} to let the blocks develop.', crowdReaction: 'murmur' },
    { playByPlay: '{rusher} follows the lead blocker for {yards} yards.', colorAnalysis: 'Old school {teamName} football right there. I love it.', crowdReaction: 'murmur' },
    { playByPlay: '{rusher} takes it wide for {yards}. {downResult}', colorAnalysis: '{defTeamName} overloaded inside and he bounced it out.', crowdReaction: 'murmur' },
    { playByPlay: '{down} and {distance}. Draw play to {rusher} for {yards}.', colorAnalysis: 'Good play call. {defTeamName} linebackers bit on the pass fake.', crowdReaction: 'murmur' },
    { playByPlay: '{rusher} picks a hole and gets {yards} yards. {downResult}', colorAnalysis: 'Patient runner. He waited for the blocks to set up.', crowdReaction: 'murmur' },
    { playByPlay: '{rusher} off left end for {yards}. {downResult}', colorAnalysis: '{teamName} changing up the run direction. Keeping {defTeamName} honest.', crowdReaction: 'murmur' },
    { playByPlay: '{rusher} up the gut for {yards} yards.', colorAnalysis: 'Nothing fancy, just north and south. {teamName} smash-mouth football.', crowdReaction: 'murmur' },
  ],
  medium: [
    { playByPlay: '{rusher} breaks through the {defTeamName} line for {yards}!', colorAnalysis: "He's running with authority today.", crowdReaction: 'cheer' },
    { playByPlay: '{rusher} finds a crease and picks up {yards} yards! {downResult}', colorAnalysis: 'Great vision to find that hole against the {defTeamName} front.', crowdReaction: 'cheer' },
    { playByPlay: '{rusher} shakes a {defTeamName} tackler and gets {yards}!', colorAnalysis: "That's a guy who refuses to go down easy.", crowdReaction: 'cheer' },
    { playByPlay: '{rusher} bounces it outside for {yards} yards!', colorAnalysis: "He saw the cutback lane and didn't hesitate. {teamName} moving the ball.", crowdReaction: 'cheer' },
    { playByPlay: '{rusher} powers through contact for {yards}! {downResult}', colorAnalysis: 'That second effort got him an extra three or four yards.', crowdReaction: 'cheer' },
    { playByPlay: '{rusher} with a nice gain of {yards} on the carry!', colorAnalysis: "{rusher} is really starting to find his rhythm for {teamName}.", crowdReaction: 'cheer' },
    { playByPlay: '{rusher} makes a man miss and picks up {yards}!', colorAnalysis: 'The {defTeamName} defensive coordinator is shaking his head.', crowdReaction: 'cheer' },
    { playByPlay: '{rusher} churns his legs for {yards} yards! {downResult}', colorAnalysis: 'Pure effort. He wanted that first down for {teamName}.', crowdReaction: 'cheer' },
    { playByPlay: '{rusher} hits the edge and turns the corner for {yards}!', colorAnalysis: "{defTeamName} can't contain the edge. That speed is a problem.", crowdReaction: 'cheer' },
    { playByPlay: '{rusher} with a strong run, {yards} yards!', colorAnalysis: "The {defTeamName} defense doesn't want to tackle this man one-on-one.", crowdReaction: 'cheer' },
    { playByPlay: '{rusher} out of {personnel} finds a lane for {yards}!', colorAnalysis: 'That heavy personnel grouping is opening holes all day for {teamName}.', crowdReaction: 'cheer' },
    { playByPlay: '{rusher} runs through the {stunt} stunt for {yards} yards!', colorAnalysis: '{defTeamName} tried to get cute and got burned for it.', crowdReaction: 'cheer' },
    { playByPlay: '{rusher} cuts back against the grain for {yards}!', colorAnalysis: 'Elite vision! The hole was on the left and he found one on the right.', crowdReaction: 'cheer' },
    { playByPlay: '{rusher} lowers the shoulder and barrels for {yards} yards!', colorAnalysis: 'He is PHYSICAL. {defTeamName} defenders do not want to tackle this man.', crowdReaction: 'cheer' },
    { playByPlay: '{rusher} with a nifty juke for {yards}! {downResult}', colorAnalysis: 'Did you see that move?! He put that defender on skates!', crowdReaction: 'cheer' },
    { playByPlay: '{rusher} squirts through a crease for {yards} yards!', colorAnalysis: 'He just appeared on the other side. Slippery runner for {teamName}.', crowdReaction: 'cheer' },
  ],
  high: [
    { playByPlay: '{rusher} BURSTS through! {yards} yards and he is STILL going!', colorAnalysis: 'You CANNOT bring this man down! {teamName} with a HUGE play!', crowdReaction: 'roar' },
    { playByPlay: '{rusher} EXPLODES through the {defTeamName} line! {yards} yards!', colorAnalysis: 'That is a GROWN MAN run! {defTeamName} had no answer!', crowdReaction: 'roar' },
    { playByPlay: '{rusher} BREAKS FREE! {yards} yards and he is FLYING!', colorAnalysis: 'Look at the speed! Nobody from {defTeamName} is catching him!', crowdReaction: 'roar' },
    { playByPlay: '{rusher} IS LOOSE! {yards} yards on a MONSTER run for {teamName}!', colorAnalysis: 'He just ran through the ENTIRE {defTeamName} defense!', crowdReaction: 'roar' },
    { playByPlay: '{rusher} SLASHES through for {yards} yards! What a run!', colorAnalysis: "That is special. {teamName} needed that big play.", crowdReaction: 'roar' },
    { playByPlay: '{rusher} TAKES IT {yards} YARDS! He will NOT be denied!', colorAnalysis: 'I just got goosebumps watching that! WHAT a run by {rusher}!', crowdReaction: 'roar' },
    { playByPlay: '{rusher} RUMBLES {yards} yards! Breaking {defTeamName} tackles left and right!', colorAnalysis: 'He broke FOUR tackles on that run! Unbelievable!', crowdReaction: 'roar' },
    { playByPlay: '{rusher} with a HUGE run! {yards} yards and the crowd goes wild!', colorAnalysis: 'That is the kind of play that completely shifts momentum for {teamName}!', crowdReaction: 'roar' },
    { playByPlay: '{rusher} STIFF ARMS a defender and GOES for {yards}!', colorAnalysis: 'DID YOU SEE THAT?! He just put that man on the GROUND!', crowdReaction: 'roar' },
    { playByPlay: '{rusher} to the HOUSE! {yards} yards UNTOUCHED!', colorAnalysis: 'The blocking was PERFECT! A convoy to the end zone for {teamName}!', crowdReaction: 'roar' },
    { playByPlay: '{rusher} with a SPECTACULAR {yards}-yard run! He will NOT go down!', colorAnalysis: 'THREE broken tackles! FOUR broken tackles! UNBELIEVABLE!', crowdReaction: 'roar' },
    { playByPlay: '{rusher} GALLOPS {yards} yards! Look at him GO!', colorAnalysis: 'The speed! The power! That is an ALL-PRO run right there!', crowdReaction: 'roar' },
  ],
};

// ---------------------------------------------------------------------------
// PASS COMPLETE
// ---------------------------------------------------------------------------

const PASS_COMPLETE_TEMPLATES: TemplateCategory = {
  low: [
    { playByPlay: '{down} and {distance}. {passer} finds {receiver} for {yards}. {downResult}', colorAnalysis: 'Good timing on that route for {teamName}.', crowdReaction: 'murmur' },
    { playByPlay: '{passer} hits {receiver} underneath for {yards} yards. {downResult}', colorAnalysis: '{teamName} taking what the {defTeamName} defense gives them.', crowdReaction: 'murmur' },
    { playByPlay: '{passer} connects with {receiver} for a gain of {yards}. {downResult}', colorAnalysis: 'Smart, efficient passing from {passer}.', crowdReaction: 'murmur' },
    { playByPlay: '{down} and {distance}. Quick pass to {receiver}, picks up {yards}.', colorAnalysis: "Get the ball out quick against this {defTeamName} pass rush.", crowdReaction: 'murmur' },
    { playByPlay: '{passer} dumps it off to {receiver} for {yards} yards.', colorAnalysis: "That's the check-down, but it moves the sticks for {teamName}.", crowdReaction: 'murmur' },
    { playByPlay: '{passer} to {receiver} on the crossing route, {yards} yards. {downResult}', colorAnalysis: 'Nice anticipation by {passer}. The ball was out before the break.', crowdReaction: 'murmur' },
    { playByPlay: '{passer} completes to {receiver} for {yards}. {downResult}', colorAnalysis: 'He saw the {defTeamName} zone coverage and found the soft spot.', crowdReaction: 'murmur' },
    { playByPlay: '{down} and {distance}. Short pass, {passer} to {receiver} for {yards} yards.', colorAnalysis: 'Easy pitch and catch. {teamName} moving methodically.', crowdReaction: 'murmur' },
    { playByPlay: '{passer} swings it to {receiver} for {yards}. {downResult}', colorAnalysis: "That's how {teamName} sustains drives. Methodical.", crowdReaction: 'murmur' },
    { playByPlay: '{passer} flips it to {receiver}, gains {yards}.', colorAnalysis: '{teamName} screen game working nicely so far.', crowdReaction: 'murmur' },
    { playByPlay: '{passer} quick slant to {receiver} for {yards}. {downResult}', colorAnalysis: 'That is their bread and butter. {teamName} has run it all day.', crowdReaction: 'murmur' },
    { playByPlay: '{down} and {distance}. {passer} hits {receiver} on the out for {yards}.', colorAnalysis: 'That throw stops the clock too. Smart football.', crowdReaction: 'murmur' },
    { playByPlay: '{passer} looks left, comes back right to {receiver} for {yards}. {downResult}', colorAnalysis: 'He moved the safety with his eyes. Veteran move by {passer}.', crowdReaction: 'murmur' },
    { playByPlay: '{passer} flips it to the flat. {receiver} gains {yards}. {downResult}', colorAnalysis: 'Simple play, easy completion. {teamName} moving the chains.', crowdReaction: 'murmur' },
    { playByPlay: '{passer} over the middle to {receiver}. {yards} yards. {downResult}', colorAnalysis: 'Tight window but he fit it in there. Gutsy throw.', crowdReaction: 'murmur' },
    { playByPlay: '{receiver} comes back for it. {passer} hits him for {yards}. {downResult}', colorAnalysis: 'Good route adjustment by {receiver}. He found the soft spot in the zone.', crowdReaction: 'murmur' },
  ],
  medium: [
    { playByPlay: '{passer} delivers a strike to {receiver} for {yards} yards! {downResult}', colorAnalysis: 'That ball was placed perfectly by the {teamName} quarterback.', crowdReaction: 'cheer' },
    { playByPlay: '{passer} fires to {receiver} and he picks up {yards}!', colorAnalysis: 'Threading the needle against {defTeamName}. Elite throw.', crowdReaction: 'cheer' },
    { playByPlay: '{passer} with a dart to {receiver}! {yards} yards! {downResult}', colorAnalysis: "That window was TINY and he fit it in. That's why he starts for {teamName}.", crowdReaction: 'cheer' },
    { playByPlay: '{passer} finds {receiver} on the sideline for {yards}!', colorAnalysis: 'Beautiful touch on that throw. Dropped it right in the bucket.', crowdReaction: 'cheer' },
    { playByPlay: '{passer} over the middle to {receiver} for {yards} yards! {downResult}', colorAnalysis: 'Gutsy throw into the {defTeamName} coverage. You need courage for that.', crowdReaction: 'cheer' },
    { playByPlay: '{passer} hits {receiver} in stride for {yards}!', colorAnalysis: 'Perfect ball placement. {receiver} never had to break stride.', crowdReaction: 'cheer' },
    { playByPlay: '{receiver} with a great catch! {yards} yards from {passer}!', colorAnalysis: "Contested catch against {defTeamName} and he came down with it.", crowdReaction: 'cheer' },
    { playByPlay: '{passer} finds the open man! {receiver} for {yards} yards! {downResult}', colorAnalysis: 'He went through his progressions and found the soft spot in the {defTeamName} zone.', crowdReaction: 'cheer' },
    { playByPlay: '{passer} connects with {receiver} across the middle for {yards}!', colorAnalysis: "Money throw by {passer}. That's what separates the great ones.", crowdReaction: 'cheer' },
    { playByPlay: '{passer} zips it to {receiver} for {yards} yards! {downResult}', colorAnalysis: 'Look at the zip on that ball. {teamName} is clicking.', crowdReaction: 'cheer' },
    { playByPlay: '{passer} reads the {defTeamName} coverage and hits {receiver} on the {concept} concept for {yards}!', colorAnalysis: "That's the pre-snap read paying off. He knew exactly where to go with it.", crowdReaction: 'cheer' },
    { playByPlay: '{passer} out of {personnel}, fires to {receiver} for {yards} yards!', colorAnalysis: 'That personnel grouping gave {teamName} the matchup they wanted.', crowdReaction: 'cheer' },
    { playByPlay: '{passer} runs the {concept} route perfectly with {receiver} for {yards}!', colorAnalysis: "{defTeamName} can't cover that route concept. It's schemed wide open.", crowdReaction: 'cheer' },
    { playByPlay: '{passer} hits {receiver} on the {concept} for {yards} against the {front} front!', colorAnalysis: 'That {defTeamName} front left them vulnerable in coverage.', crowdReaction: 'cheer' },
    { playByPlay: '{passer} threads it to {receiver} between two defenders for {yards}!', colorAnalysis: 'Only an elite QB makes that throw. That window was TINY.', crowdReaction: 'cheer' },
    { playByPlay: '{passer} rolls out and finds {receiver} for {yards}! {downResult}', colorAnalysis: 'Great improvisational play. He extended it and made something happen.', crowdReaction: 'cheer' },
    { playByPlay: '{passer} drops a DIME to {receiver} for {yards} yards!', colorAnalysis: 'The touch on that throw was incredible. Dropped it right in the breadbasket.', crowdReaction: 'cheer' },
    { playByPlay: '{receiver} makes a man miss after the catch! {yards} total yards!', colorAnalysis: 'That is YAC ability! Catch and run — {teamName} loves that.', crowdReaction: 'cheer' },
    { playByPlay: '{passer} pump-fakes, then fires to {receiver} for {yards}!', colorAnalysis: 'The pump fake froze the safety. Beautiful move by {passer}.', crowdReaction: 'cheer' },
  ],
  high: [
    { playByPlay: '{passer} LAUNCHES it deep... {receiver} HAS IT! {yards} YARDS!', colorAnalysis: 'WHAT a throw! WHAT a catch! {teamName} with a HUGE play!', crowdReaction: 'roar' },
    { playByPlay: '{passer} FIRES it downfield! {receiver} MAKES THE GRAB! {yards} yards!', colorAnalysis: 'INCREDIBLE throw and catch for {teamName}! Highlight reel!', crowdReaction: 'roar' },
    { playByPlay: '{passer} AIRS IT OUT! {receiver} HAULS IT IN! {yards} YARDS!', colorAnalysis: 'PERFECT ball by {passer}! {defTeamName} had NO answer!', crowdReaction: 'roar' },
    { playByPlay: '{receiver} IS WIDE OPEN! {passer} finds him for {yards} YARDS!', colorAnalysis: '{defTeamName} blew that coverage and PAID for it!', crowdReaction: 'roar' },
    { playByPlay: '{passer} ROCKETS one to {receiver}! {yards} yards! What a PLAY!', colorAnalysis: "I don't know how he threw that ball. {passer} is SPECIAL.", crowdReaction: 'roar' },
    { playByPlay: 'DEEP BALL! {passer} to {receiver}! {yards} yards and the {teamName} sideline is GOING CRAZY!', colorAnalysis: 'That is a BEAUTIFUL throw! Right on the money!', crowdReaction: 'roar' },
    { playByPlay: '{passer} lets it FLY! {receiver} goes UP and GETS IT! {yards} yards!', colorAnalysis: 'Moss-like! {receiver} was a man among boys on that play!', crowdReaction: 'roar' },
    { playByPlay: '{receiver} with a SPECTACULAR catch! {yards} yards from {passer}!', colorAnalysis: 'Are you KIDDING me?! How did he hold on to that against {defTeamName}?!', crowdReaction: 'roar' },
    { playByPlay: '{passer} reads the {defTeamName} coverage PERFECTLY! The {concept} concept is MONEY! {yards} YARDS!', colorAnalysis: 'THAT is what happens when you scheme against that coverage! BRILLIANT!', crowdReaction: 'roar' },
    { playByPlay: '{passer} with the {concept} route to {receiver}! {yards} YARDS! INCREDIBLE!', colorAnalysis: '{defTeamName} CANNOT defend that concept when {teamName} runs it THAT well!', crowdReaction: 'roar' },
    { playByPlay: '{passer} DROPS IT IN THE BUCKET! {receiver} for {yards} YARDS!', colorAnalysis: 'How do you defend THAT?! PERFECT throw, PERFECT catch! {teamName} is ON FIRE!', crowdReaction: 'roar' },
    { playByPlay: '{receiver} BEATS his man deep and {passer} DELIVERS! {yards} yards!', colorAnalysis: 'STEP for STEP and {passer} put it where only HIS GUY could get it!', crowdReaction: 'roar' },
    { playByPlay: '{passer} under HEAVY PRESSURE — fires to {receiver}! {yards} YARDS! WOW!', colorAnalysis: 'He got CRUSHED as he threw it and STILL delivered a STRIKE! INCREDIBLE!', crowdReaction: 'roar' },
    { playByPlay: 'ONE-HANDED CATCH by {receiver}! {yards} yards from {passer}!', colorAnalysis: 'That is RIDICULOUS! A HIGHLIGHT REEL catch! Are you KIDDING me?!', crowdReaction: 'roar' },
  ],
};

// ---------------------------------------------------------------------------
// PASS INCOMPLETE
// ---------------------------------------------------------------------------

const PASS_INCOMPLETE_TEMPLATES: TemplateCategory = {
  low: [
    { playByPlay: '{down} and {distance}. Pass intended for {receiver}... incomplete.', colorAnalysis: '{passer} just missed him there.', crowdReaction: 'murmur' },
    { playByPlay: '{passer} throws it away. Incomplete.', colorAnalysis: 'Smart by {passer} to live for another down.', crowdReaction: 'murmur' },
    { playByPlay: '{down} and {distance}. {passer} fires and it falls incomplete.', colorAnalysis: '{defTeamName} coverage was tight. Nowhere to go with it.', crowdReaction: 'murmur' },
    { playByPlay: 'Pass is incomplete. {receiver} couldn\'t come up with it.', colorAnalysis: 'Tough catch, but {teamName} would like to see him make that one.', crowdReaction: 'murmur' },
    { playByPlay: '{passer} misses {receiver}. Incomplete.', colorAnalysis: 'Just a bit overthrown. {teamName} not in sync on that one.', crowdReaction: 'murmur' },
    { playByPlay: 'Incomplete. Ball sails over {receiver}\'s head.', colorAnalysis: '{passer} couldn\'t drive that ball. Back foot slipped.', crowdReaction: 'murmur' },
    { playByPlay: '{passer} looking right... throws... incomplete.', colorAnalysis: 'The window wasn\'t there against {defTeamName}.', crowdReaction: 'murmur' },
    { playByPlay: 'Pass is batted down at the line! Incomplete.', colorAnalysis: '{defTeamName} big men getting their hands up.', crowdReaction: 'murmur' },
    { playByPlay: '{passer} underthrows {receiver}. Incomplete.', colorAnalysis: 'He didn\'t get enough on it. {receiver} had a step but the ball died.', crowdReaction: 'murmur' },
    { playByPlay: '{down} and {distance}. {passer} to {receiver}, pass is broken up.', colorAnalysis: 'Good coverage by the {defTeamName} secondary on that one.', crowdReaction: 'murmur' },
    { playByPlay: '{passer} forces it to {receiver}. Incomplete.', colorAnalysis: 'That ball should not have been thrown. Lucky it wasn\'t intercepted.', crowdReaction: 'murmur' },
    { playByPlay: 'Pass falls incomplete. {receiver} was well covered.', colorAnalysis: '{defTeamName} in a blanket. Nothing available for {passer}.', crowdReaction: 'murmur' },
  ],
  medium: [
    { playByPlay: '{passer} heaves it deep for {receiver}... just out of reach!', colorAnalysis: 'Oh, that was so close. Another foot and that\'s a huge play for {teamName}.', crowdReaction: 'groan' },
    { playByPlay: '{passer} fires... {defender} breaks it up! Incomplete!', colorAnalysis: 'Great coverage by {defender}. {defTeamName} in perfect position.', crowdReaction: 'groan' },
    { playByPlay: '{receiver} dives for it... can\'t hang on! Incomplete!', colorAnalysis: 'He got his hands on it but the ground knocked it loose. {teamName} can\'t catch a break.', crowdReaction: 'groan' },
    { playByPlay: '{passer} under pressure, throws it up for {receiver}... drops it!', colorAnalysis: '{teamName} had their man if that ball is on target. Missed opportunity.', crowdReaction: 'groan' },
    { playByPlay: 'What a play by {defender}! Pass broken up!', colorAnalysis: 'Money throw by {passer} but an even better play by {defTeamName}.', crowdReaction: 'groan' },
    { playByPlay: '{passer} goes deep for {receiver}... can\'t pull it in!', colorAnalysis: '{receiver} will be thinking about that one all week.', crowdReaction: 'groan' },
    { playByPlay: '{passer} with a bullet to {receiver}... off his fingertips! Incomplete!', colorAnalysis: 'He had the right idea but the execution was just a hair off.', crowdReaction: 'groan' },
    { playByPlay: '{receiver} leaps for it... can\'t come down with it! Incomplete!', colorAnalysis: 'So close! That ball was in his hands for a split second.', crowdReaction: 'groan' },
    { playByPlay: '{passer} puts it on the money but {defender} swats it away!', colorAnalysis: 'Elite coverage by {defTeamName}. That was a PERFECT break on the ball.', crowdReaction: 'groan' },
    { playByPlay: '{passer} tries the back-shoulder throw... not quite. Incomplete.', colorAnalysis: 'They weren\'t on the same page. {receiver} sat and {passer} threw it back.', crowdReaction: 'groan' },
  ],
  high: [
    { playByPlay: '{passer} LAUNCHES it deep... {receiver} can\'t get there! So close!', colorAnalysis: 'INCHES away from a game-changing play for {teamName}!', crowdReaction: 'gasp' },
    { playByPlay: '{receiver} HAD IT! And it goes right through his hands!', colorAnalysis: 'Oh no. That was right in his hands! {teamName} cannot believe it!', crowdReaction: 'gasp' },
    { playByPlay: '{passer} fires into the end zone for {teamName}... DROPPED! Incomplete!', colorAnalysis: 'You HAVE to make that catch. That was the game right there.', crowdReaction: 'gasp' },
    { playByPlay: 'WIDE OPEN! {receiver} DROPS IT! Incomplete!', colorAnalysis: 'I cannot BELIEVE he dropped that ball. {teamName} left points on the field.', crowdReaction: 'gasp' },
    { playByPlay: '{passer} goes DEEP and {receiver} has POSITION... BROKEN UP by {defender}!', colorAnalysis: 'What a play by {defender}! He saved a TOUCHDOWN there!', crowdReaction: 'gasp' },
    { playByPlay: '{receiver} is OPEN in the end zone! {passer} throws it... OFF HIS HANDS!', colorAnalysis: 'HEARTBREAKING! That was the MOMENT and it slipped through his fingers!', crowdReaction: 'gasp' },
    { playByPlay: '{passer} HEAVES IT with everything he\'s got... just OUT OF REACH!', colorAnalysis: 'The crowd GROANS! That was a DAGGER if he comes down with it!', crowdReaction: 'gasp' },
  ],
};

// ---------------------------------------------------------------------------
// SACK
// ---------------------------------------------------------------------------

const SACK_TEMPLATES: TemplateCategory = {
  low: [
    { playByPlay: '{down} and {distance}. {passer} is brought down for a loss of {yards}.', colorAnalysis: '{defTeamName} pass rush got home there.', crowdReaction: 'cheer' },
    { playByPlay: '{passer} sacked, loses {yards} yards.', colorAnalysis: "{passer} held the ball too long. You've got to get rid of it.", crowdReaction: 'cheer' },
    { playByPlay: '{defender} gets to {passer} for a sack. Loss of {yards}.', colorAnalysis: '{teamName} pocket collapsed from the blind side.', crowdReaction: 'cheer' },
    { playByPlay: '{passer} is taken down behind the line. Loss of {yards}.', colorAnalysis: '{teamName} protection broke down. {defTeamName} gets to him.', crowdReaction: 'cheer' },
    { playByPlay: '{passer} brought down in the backfield. Loss of {yards}.', colorAnalysis: 'He never had a chance to set his feet back there.', crowdReaction: 'cheer' },
    { playByPlay: '{defender} cleans up {passer} for a loss of {yards}. {downResult}', colorAnalysis: 'Interior pressure pushed {passer} right into the waiting arms.', crowdReaction: 'cheer' },
    { playByPlay: '{passer} is swallowed up behind the line of scrimmage. Loss of {yards}.', colorAnalysis: '{defTeamName} winning the battle up front. {teamName} needs to adjust their protection.', crowdReaction: 'cheer' },
    { playByPlay: '{down} and {distance}. {defender} drags {passer} down. Loss of {yards}.', colorAnalysis: 'The edge rusher beat the tackle clean. Textbook pass rush.', crowdReaction: 'cheer' },
  ],
  medium: [
    { playByPlay: '{defender} GETS to {passer}! Sacked for a loss of {yards}!', colorAnalysis: 'He came in UNTOUCHED! The {teamName} left tackle completely whiffed!', crowdReaction: 'roar' },
    { playByPlay: '{passer} goes DOWN! Sacked by {defender} for a loss of {yards}!', colorAnalysis: "Huge play for {defTeamName}! Big momentum shift.", crowdReaction: 'roar' },
    { playByPlay: '{defender} blows past the blocker and DROPS {passer}! Loss of {yards}!', colorAnalysis: 'Speed kills! {defTeamName} pass rush is relentless today!', crowdReaction: 'roar' },
    { playByPlay: 'SACK! {defender} wraps up {passer} for a loss of {yards}!', colorAnalysis: '{teamName} offensive line struggling to handle this {defTeamName} rush.', crowdReaction: 'roar' },
    { playByPlay: '{defender} runs the {rushGame} game and GETS {passer}! Loss of {yards}!', colorAnalysis: 'That twist stunt completely fooled the {teamName} offensive line!', crowdReaction: 'roar' },
    { playByPlay: '{defender} off the {front} front GETS to {passer}! Sacked for a loss of {yards}!', colorAnalysis: 'That {defTeamName} front alignment gave them the mismatch they wanted.', crowdReaction: 'roar' },
    { playByPlay: '{defender} BULL RUSHES through and BURIES {passer}! Loss of {yards}!', colorAnalysis: 'Pure power! He just walked that blocker right back into the QB!', crowdReaction: 'roar' },
    { playByPlay: 'HERE COMES {defender}! SACK! Loss of {yards}!', colorAnalysis: 'The blitz got home! {defTeamName} dialed up the pressure and it WORKED!', crowdReaction: 'roar' },
    { playByPlay: '{passer} tries to escape but {defender} TRACKS HIM DOWN! Loss of {yards}!', colorAnalysis: 'Great pursuit! He kept his eyes on the quarterback the entire way!', crowdReaction: 'roar' },
    { playByPlay: '{defender} comes FREE! SACK for a loss of {yards}!', colorAnalysis: 'The protection slid the wrong way. That is a coaching mistake by {teamName}.', crowdReaction: 'roar' },
  ],
  high: [
    { playByPlay: '{defender} CRUSHES {passer}! HUGE SACK! Loss of {yards}!', colorAnalysis: "DEVASTATING hit! {passer} didn't even see him coming!", crowdReaction: 'roar' },
    { playByPlay: '{passer} is HAMMERED by {defender}! DOWN he goes! Loss of {yards}!', colorAnalysis: 'WHAT A PLAY! {defTeamName} defense is FIRED UP after that one!', crowdReaction: 'roar' },
    { playByPlay: 'STRIP SACK! {defender} LEVELS {passer}! Loss of {yards}!', colorAnalysis: 'Oh my! That could change EVERYTHING for {defTeamName}!', crowdReaction: 'roar' },
    { playByPlay: '{defender} comes SCREAMING off the edge and BURIES {passer}! Loss of {yards}!', colorAnalysis: '{defender} is UNBLOCKABLE today! {teamName} has no answer!', crowdReaction: 'roar' },
    { playByPlay: '{defender} BLOWS THROUGH the line and DESTROYS {passer}! Loss of {yards}!', colorAnalysis: 'That man is a WRECKING BALL! {teamName} cannot block him!', crowdReaction: 'roar' },
    { playByPlay: 'A DEVASTATING SACK by {defender}! {passer} is DOWN! Loss of {yards}!', colorAnalysis: 'You could hear that HIT in the upper deck! What a MONSTER play!', crowdReaction: 'roar' },
    { playByPlay: '{defender} EATS {passer} ALIVE! SACKED for a loss of {yards}!', colorAnalysis: 'That is {defender}\'s THIRD sack today! He is absolutely DOMINATING!', crowdReaction: 'roar' },
  ],
};

// ---------------------------------------------------------------------------
// SCRAMBLE
// ---------------------------------------------------------------------------

const SCRAMBLE_TEMPLATES: TemplateCategory = {
  low: [
    { playByPlay: '{rusher} scrambles for {yards} yards. {downResult}', colorAnalysis: 'Nothing was there against {defTeamName}, so {rusher} took off.', crowdReaction: 'murmur' },
    { playByPlay: '{rusher} tucks it and runs for {yards}. {downResult}', colorAnalysis: 'Good decision by {rusher} to pull it down and take the yards.', crowdReaction: 'murmur' },
    { playByPlay: '{rusher} slides after a scramble of {yards}. {downResult}', colorAnalysis: 'Smart play — protect yourself and take the yards.', crowdReaction: 'murmur' },
    { playByPlay: '{down} and {distance}. {rusher} rolls out and runs for {yards}.', colorAnalysis: 'The pocket collapsed. He had no choice but to take off.', crowdReaction: 'murmur' },
    { playByPlay: '{rusher} escapes trouble and gains {yards}. {downResult}', colorAnalysis: 'Nobody was open so he used his legs. No harm in that.', crowdReaction: 'murmur' },
    { playByPlay: '{rusher} pulls it down and picks up {yards} on the ground.', colorAnalysis: 'He looked downfield, nothing there, and kept it himself.', crowdReaction: 'murmur' },
  ],
  medium: [
    { playByPlay: '{rusher} breaks the {teamName} pocket and scrambles for {yards}!', colorAnalysis: "You can't coach that kind of athleticism at quarterback!", crowdReaction: 'cheer' },
    { playByPlay: '{rusher} escapes the {defTeamName} rush and picks up {yards}!', colorAnalysis: 'That is a nightmare for {defTeamName} when he can do that.', crowdReaction: 'cheer' },
    { playByPlay: '{rusher} buys time and takes off for {yards} yards! {downResult}', colorAnalysis: '{rusher} made something out of nothing on that play.', crowdReaction: 'cheer' },
    { playByPlay: '{rusher} shakes the {defTeamName} rush and picks up {yards}!', colorAnalysis: 'When the pocket breaks down, he becomes a running back. Dual threat.', crowdReaction: 'cheer' },
    { playByPlay: '{rusher} spins away from the pressure and gains {yards}! {downResult}', colorAnalysis: 'The athleticism! He turned a broken play into a positive gain for {teamName}.', crowdReaction: 'cheer' },
    { playByPlay: '{rusher} sees daylight and takes off! {yards} yards!', colorAnalysis: '{defTeamName} over-committed to the rush and left a highway up the middle.', crowdReaction: 'cheer' },
    { playByPlay: '{rusher} keeps it alive with his legs! {yards} yards! {downResult}', colorAnalysis: 'That is what makes {rusher} so dangerous — he extends plays.', crowdReaction: 'cheer' },
    { playByPlay: '{rusher} rolls right and turns the corner for {yards}!', colorAnalysis: '{defTeamName} cannot contain this quarterback. He is too fast.', crowdReaction: 'cheer' },
  ],
  high: [
    { playByPlay: '{rusher} ELUDES the {defTeamName} rush and TAKES OFF! {yards} yards!', colorAnalysis: '{rusher} is a MAGICIAN back there! Houdini could not have escaped that pocket!', crowdReaction: 'roar' },
    { playByPlay: '{rusher} BREAKS FREE and RACES for {yards} yards!', colorAnalysis: 'When {rusher} starts running it is OVER! Nobody from {defTeamName} is catching him!', crowdReaction: 'roar' },
    { playByPlay: '{rusher} SHAKES TWO DEFENDERS and EXPLODES for {yards}!', colorAnalysis: 'That is a SUPERSTAR play! {defTeamName} had him dead to rights and he ESCAPED!', crowdReaction: 'roar' },
    { playByPlay: '{rusher} IS LOOSE! SCRAMBLES for {yards} yards! FIRST DOWN!', colorAnalysis: 'How did he get out of there?! THREE defenders had a shot and he beat them ALL!', crowdReaction: 'roar' },
    { playByPlay: '{rusher} REFUSES to go down! SCRAMBLES for {yards}!', colorAnalysis: 'The athleticism on display is UNREAL! {teamName} has a WEAPON at quarterback!', crowdReaction: 'roar' },
  ],
};

// ---------------------------------------------------------------------------
// TOUCHDOWN (always high energy)
// ---------------------------------------------------------------------------

const TOUCHDOWN_RUSH_TEMPLATES: CommentaryTemplate[] = [
  { playByPlay: 'TOUCHDOWN! {rusher} takes it in from {yards} yards out!', colorAnalysis: 'And THIS PLACE ERUPTS! What a drive!', crowdReaction: 'roar' },
  { playByPlay: '{rusher} PUNCHES IT IN! TOUCHDOWN!', colorAnalysis: 'That is exactly what they needed! What a response!', crowdReaction: 'roar' },
  { playByPlay: '{rusher} dives over the pile... TOUCHDOWN {teamName}!', colorAnalysis: 'Nothing was going to stop him from getting into that end zone!', crowdReaction: 'roar' },
  { playByPlay: '{rusher} walks into the end zone! TOUCHDOWN! {yards} yards!', colorAnalysis: 'Untouched! The offensive line just dominated on that play!', crowdReaction: 'roar' },
  { playByPlay: '{rusher} BURSTS into the end zone! TOUCHDOWN!', colorAnalysis: 'HE. WILL. NOT. BE. DENIED! What a run!', crowdReaction: 'roar' },
  { playByPlay: 'HE IS IN! {rusher} SCORES from {yards} yards out!', colorAnalysis: 'That is pure POWER football! You cannot stop that!', crowdReaction: 'roar' },
  { playByPlay: '{rusher} LEAPS over the goal line! TOUCHDOWN {teamName}!', colorAnalysis: 'What an athletic play to finish that drive!', crowdReaction: 'roar' },
  { playByPlay: '{rusher} SPINS into the end zone! TOUCHDOWN!', colorAnalysis: 'Incredible body control! He put the team on his back!', crowdReaction: 'roar' },
  { playByPlay: '{rusher} TRUCKS a defender into the end zone! TOUCHDOWN!', colorAnalysis: 'He ran THROUGH that man! Just absolutely TRUCKED him!', crowdReaction: 'roar' },
  { playByPlay: '{rusher} BOUNCES it outside and SCORES! TOUCHDOWN {teamName}!', colorAnalysis: 'The SPEED to the edge! Nobody on {defTeamName} could keep up!', crowdReaction: 'roar' },
  { playByPlay: '{rusher} takes the TOSS and walks in! TOUCHDOWN! {yards} yards!', colorAnalysis: 'The blocking on the edge was PHENOMENAL! Escort service to the end zone!', crowdReaction: 'roar' },
  { playByPlay: 'QB SNEAK! {rusher} pushes across! TOUCHDOWN {teamName}!', colorAnalysis: 'The push by the {teamName} offensive line! They MOVED that pile!', crowdReaction: 'roar' },
];

const TOUCHDOWN_PASS_TEMPLATES: CommentaryTemplate[] = [
  { playByPlay: '{passer} FIRES to {receiver} in the end zone... TOUCHDOWN {teamName}!', colorAnalysis: 'That is TEXTBOOK! You draw it up, you execute it, TOUCHDOWN!', crowdReaction: 'roar' },
  { playByPlay: 'TOUCHDOWN! {passer} to {receiver}! {yards} yards!', colorAnalysis: 'What a connection! Those two are on a DIFFERENT level today!', crowdReaction: 'roar' },
  { playByPlay: '{passer} lobs it to the corner... {receiver} HAULS IT IN! TOUCHDOWN!', colorAnalysis: 'Only HIS GUY could catch that ball. What a throw!', crowdReaction: 'roar' },
  { playByPlay: '{receiver} is WIDE OPEN! {passer} hits him! TOUCHDOWN {teamName}!', colorAnalysis: 'Somebody busted that coverage BAD! Easy money!', crowdReaction: 'roar' },
  { playByPlay: '{passer} rolls right... fires... TOUCHDOWN! {receiver} in the end zone!', colorAnalysis: 'He extended the play and made something MAGICAL happen!', crowdReaction: 'roar' },
  { playByPlay: '{passer} SLINGS it to {receiver}! TOUCHDOWN! {yards} yards through the air!', colorAnalysis: 'That is a LASER beam! Right on the money!', crowdReaction: 'roar' },
  { playByPlay: 'End zone! {passer} finds {receiver}! TOUCHDOWN!', colorAnalysis: 'The play design was PERFECT. Never had a chance to stop it.', crowdReaction: 'roar' },
  { playByPlay: '{passer} with a PERFECT back-shoulder throw to {receiver}! TOUCHDOWN!', colorAnalysis: 'You cannot defend that throw. That is NFL perfection.', crowdReaction: 'roar' },
  { playByPlay: '{passer} THREADS THE NEEDLE to {receiver} in the corner! TOUCHDOWN!', colorAnalysis: 'Fitting that ball into TRIPLE coverage! Only the GREATS make that throw!', crowdReaction: 'roar' },
  { playByPlay: '{receiver} MOSSED HIM! Over the defender! TOUCHDOWN from {passer}!', colorAnalysis: 'He went UP and GOT IT! The defender had NO chance against THAT!', crowdReaction: 'roar' },
  { playByPlay: 'PLAY ACTION! {passer} finds {receiver} WIDE OPEN! TOUCHDOWN!', colorAnalysis: 'The ENTIRE defense bit on the fake! Nobody within 10 yards of {receiver}!', crowdReaction: 'roar' },
  { playByPlay: '{passer} on the RUN fires to {receiver}! TOUCHDOWN {teamName}! {yards} yards!', colorAnalysis: 'OFF PLATFORM! Throwing across his body! You have to be SPECIAL to make that throw!', crowdReaction: 'roar' },
  { playByPlay: 'SCREEN to {receiver}! He has BLOCKERS! TOUCHDOWN! {yards} yards!', colorAnalysis: 'The offensive line was OUT IN FRONT! {receiver} just followed the convoy!', crowdReaction: 'roar' },
];

// ---------------------------------------------------------------------------
// INTERCEPTION
// ---------------------------------------------------------------------------

const INTERCEPTION_TEMPLATES: TemplateCategory = {
  low: [
    { playByPlay: 'Intercepted. {defender} picks it off at the {fieldPosition}.', colorAnalysis: 'Poor decision. The defender was sitting on that route.', crowdReaction: 'groan' },
    { playByPlay: '{defender} intercepts {passer}. Turnover.', colorAnalysis: 'He stared down his receiver and the defender jumped it.', crowdReaction: 'groan' },
  ],
  medium: [
    { playByPlay: 'INTERCEPTED! {defender} picks it off at the {fieldPosition}!', colorAnalysis: 'Oh that is a COSTLY mistake!', crowdReaction: 'gasp' },
    { playByPlay: 'PICKED OFF! {defender} jumps the route!', colorAnalysis: 'He read that play like a book!', crowdReaction: 'gasp' },
    { playByPlay: '{defender} with the INTERCEPTION! What a play!', colorAnalysis: 'That ball should NEVER have been thrown. He was covered the whole way.', crowdReaction: 'gasp' },
    { playByPlay: '{passer} throws it right to {defender}! INTERCEPTED!', colorAnalysis: 'That is a gift. He absolutely did NOT see that defender.', crowdReaction: 'gasp' },
  ],
  high: [
    { playByPlay: 'PICKED OFF! {defender} INTERCEPTS IT AND HE IS GONE! PICK SIX!', colorAnalysis: 'TAKE IT TO THE HOUSE! WHAT A PLAY! WHAT A DISASTER!', crowdReaction: 'roar' },
    { playByPlay: '{defender} JUMPS THE ROUTE! INTERCEPTED! THIS CHANGES EVERYTHING!', colorAnalysis: 'That is a BACKBREAKER! You cannot turn the ball over in this situation!', crowdReaction: 'roar' },
    { playByPlay: 'INTERCEPTION! {defender} SNATCHES IT OUT OF THE AIR!', colorAnalysis: 'INCREDIBLE ball skills! That was meant for the offense and he TOOK it!', crowdReaction: 'roar' },
    { playByPlay: '{passer} is PICKED OFF! {defender} with the game-changing play!', colorAnalysis: 'That may have just LOST them this football game!', crowdReaction: 'roar' },
  ],
};

// ---------------------------------------------------------------------------
// FUMBLE
// ---------------------------------------------------------------------------

const FUMBLE_TEMPLATES: TemplateCategory = {
  low: [
    { playByPlay: 'Fumble! Recovered by {teamName}.', colorAnalysis: 'Ball security. Number one priority and he failed.', crowdReaction: 'gasp' },
    { playByPlay: 'The ball is loose! {teamName} recovers.', colorAnalysis: 'He got stripped from behind. Never saw it coming.', crowdReaction: 'gasp' },
  ],
  medium: [
    { playByPlay: "AND IT'S LOOSE! FUMBLE! Recovered by {teamName}!", colorAnalysis: 'That ball is out! What a turn of events!', crowdReaction: 'gasp' },
    { playByPlay: 'FUMBLE! {teamName} pounces on it!', colorAnalysis: 'He needs to protect the football! That is a HUGE turnover!', crowdReaction: 'gasp' },
    { playByPlay: 'HE LOST IT! The ball is on the ground and {teamName} recovers!', colorAnalysis: 'That hit jarred it loose! What a play by the defense!', crowdReaction: 'gasp' },
  ],
  high: [
    { playByPlay: 'FUMBLE! THE BALL IS FREE! {teamName} FALLS ON IT!', colorAnalysis: 'OH MY! THIS GAME JUST TURNED ON ITS HEAD!', crowdReaction: 'roar' },
    { playByPlay: 'STRIPPED! The ball is OUT! {teamName} RECOVERS!', colorAnalysis: 'What a DEVASTATING turnover! You CANNOT let that happen in this situation!', crowdReaction: 'roar' },
    { playByPlay: 'THE BALL IS LOOSE! FUMBLE! {teamName} HAS IT!', colorAnalysis: 'Unbelievable! The momentum has COMPLETELY shifted!', crowdReaction: 'roar' },
  ],
};

// ---------------------------------------------------------------------------
// FIELD GOAL MADE
// ---------------------------------------------------------------------------

const FIELD_GOAL_MADE_TEMPLATES: TemplateCategory = {
  low: [
    { playByPlay: "{yards}-yard field goal attempt... it's good.", colorAnalysis: 'Right down the middle. No drama there.', crowdReaction: 'cheer' },
    { playByPlay: 'The kick is up from {yards} yards... good!', colorAnalysis: 'A chip shot. Easy three points.', crowdReaction: 'cheer' },
    { playByPlay: '{yards}-yard field goal is good.', colorAnalysis: 'He could kick that one in his sleep.', crowdReaction: 'cheer' },
  ],
  medium: [
    { playByPlay: "{yards}-yard attempt... IT'S GOOD!", colorAnalysis: 'Put it right through the uprights! Clutch kicking!', crowdReaction: 'cheer' },
    { playByPlay: 'From {yards} yards out... the kick is UP... and it is GOOD!', colorAnalysis: "He nailed it! That's a big-time kick right there!", crowdReaction: 'cheer' },
    { playByPlay: '{yards}-yard field goal... splits the uprights! GOOD!', colorAnalysis: 'Great hold, great snap, great kick. All three phases working.', crowdReaction: 'cheer' },
  ],
  high: [
    { playByPlay: '{yards}-yard field goal attempt... THE KICK IS UP... IT IS GOOD!', colorAnalysis: 'He DRILLS it from {yards} yards! ICE in his veins!', crowdReaction: 'roar' },
    { playByPlay: 'From {yards} yards! The kick is UP... it has the distance... IT IS GOOD!', colorAnalysis: 'WHAT A KICK! That is one of the longest field goals you will EVER see!', crowdReaction: 'roar' },
    { playByPlay: '{yards} YARDS! HE NAILS IT! GOOD!', colorAnalysis: 'That man is MONEY when it matters most!', crowdReaction: 'roar' },
  ],
};

// ---------------------------------------------------------------------------
// FIELD GOAL MISSED
// ---------------------------------------------------------------------------

const FIELD_GOAL_MISSED_TEMPLATES: TemplateCategory = {
  low: [
    { playByPlay: '{yards}-yard attempt... no good. Wide {direction}.', colorAnalysis: "Oh, that's a backbreaker.", crowdReaction: 'groan' },
    { playByPlay: 'The kick from {yards} yards... misses {direction}.', colorAnalysis: 'He pushed it. Got under the ball too much.', crowdReaction: 'groan' },
  ],
  medium: [
    { playByPlay: '{yards}-yard attempt... NO GOOD! Wide {direction}!', colorAnalysis: "He's going to wish he had that one back. Costly miss.", crowdReaction: 'groan' },
    { playByPlay: 'The kick is up... NO! It drifts {direction}! No good!', colorAnalysis: 'Those are points left on the board. You cannot afford that.', crowdReaction: 'groan' },
    { playByPlay: '{yards}-yard field goal... pushed it {direction}! No good!', colorAnalysis: 'I think the wind got that one. But still, you have to make it.', crowdReaction: 'groan' },
  ],
  high: [
    { playByPlay: '{yards}-yard attempt... it is... NO GOOD! WIDE {direction}!', colorAnalysis: 'OH NO! That could HAUNT them! What a time to miss!', crowdReaction: 'gasp' },
    { playByPlay: 'The kick is UP from {yards}... it is... NO! NO GOOD!', colorAnalysis: 'HEARTBREAK! He had the distance but it sails {direction}!', crowdReaction: 'gasp' },
  ],
};

// ---------------------------------------------------------------------------
// PUNT
// ---------------------------------------------------------------------------

const PUNT_TEMPLATES: TemplateCategory = {
  low: [
    { playByPlay: '{punter} gets off a {yards}-yard punt.', colorAnalysis: 'Good hang time on that one.', crowdReaction: 'murmur' },
    { playByPlay: 'Punt by {punter}, {yards} yards.', colorAnalysis: 'Solid punt. Pins them back.', crowdReaction: 'murmur' },
    { playByPlay: '{punter} punts it away. {yards} yards.', colorAnalysis: 'The field position battle continues.', crowdReaction: 'murmur' },
    { playByPlay: 'Fourth down, {punter} sends it {yards} yards downfield.', colorAnalysis: 'Nothing wrong with good defense and a punt. Live to fight another day.', crowdReaction: 'murmur' },
  ],
  medium: [
    { playByPlay: '{punter} BOOMS it! {yards}-yard punt!', colorAnalysis: 'What a boot! That is going to flip the field!', crowdReaction: 'cheer' },
    { playByPlay: '{punter} with a monster punt! {yards} yards!', colorAnalysis: 'That is a weapon. The punt game is underrated.', crowdReaction: 'cheer' },
  ],
  high: [
    { playByPlay: '{punter} with an INCREDIBLE punt! {yards} yards and it pins them deep!', colorAnalysis: 'That is a GAME-CHANGING punt! Backed them all the way up!', crowdReaction: 'cheer' },
  ],
};

// ---------------------------------------------------------------------------
// KICKOFF — tiered by return outcome
// ---------------------------------------------------------------------------

const KICKOFF_TOUCHBACK_TEMPLATES: CommentaryTemplate[] = [
  { playByPlay: '{teamName} kicks it away. Into the end zone. Touchback.', colorAnalysis: "{defTeamName} will start at the 25.", crowdReaction: 'murmur' },
  { playByPlay: 'The kick is away from {teamName}! Touchback. Ball on the 25.', colorAnalysis: 'No reason to bring that one out. {defTeamName} ball.', crowdReaction: 'murmur' },
  { playByPlay: 'And we are underway! {teamName} kicks it to the goal line, touchback.', colorAnalysis: 'Smart to take a knee. {defTeamName} starts from the 25.', crowdReaction: 'murmur' },
  { playByPlay: '{teamName} kicks it deep. Touchback.', colorAnalysis: "Standard start. Ball on the 25-yard line for {defTeamName}.", crowdReaction: 'murmur' },
  { playByPlay: 'Big leg from the {teamName} kicker. Into the end zone. Touchback.', colorAnalysis: "Not much the return unit can do with that one.", crowdReaction: 'murmur' },
];

const KICKOFF_SHORT_RETURN_TEMPLATES: CommentaryTemplate[] = [
  { playByPlay: '{teamName} kicks off. Brought down quickly at the {fieldPosition}.', colorAnalysis: '{defTeamName} barely got past the 20. Coverage was right there.', crowdReaction: 'murmur' },
  { playByPlay: 'Kickoff received by {defTeamName}. Stopped at the {fieldPosition}. {yards}-yard return.', colorAnalysis: "Coverage unit swarmed him. That's what you want to see.", crowdReaction: 'murmur' },
  { playByPlay: '{teamName} kicks it off. Short return, tackled at the {fieldPosition}.', colorAnalysis: '{defTeamName} will need to earn their field position on this drive.', crowdReaction: 'murmur' },
];

const KICKOFF_GOOD_RETURN_TEMPLATES: CommentaryTemplate[] = [
  { playByPlay: '{teamName} kicks off. Return to the {fieldPosition}! {yards} yards!', colorAnalysis: 'Nice return! Found a seam in the coverage.', crowdReaction: 'cheer' },
  { playByPlay: 'Kickoff return... the wedge opened up a lane! {yards} yards to the {fieldPosition}!', colorAnalysis: "Good blocking on that return for {defTeamName}. That's a quality start.", crowdReaction: 'cheer' },
  { playByPlay: 'Kickoff received and returned {yards} yards to the {fieldPosition}.', colorAnalysis: '{defTeamName} gave their offense some room to work with.', crowdReaction: 'cheer' },
];

const KICKOFF_BIG_RETURN_TEMPLATES: CommentaryTemplate[] = [
  { playByPlay: '{teamName} kicks off and the return man HAS ROOM! {yards} yards to the {fieldPosition}!', colorAnalysis: 'What a return! The coverage broke down and he made them PAY!', crowdReaction: 'roar' },
  { playByPlay: 'Kickoff return! Breaking tackles! {yards} yards to the {fieldPosition}!', colorAnalysis: '{defTeamName} special teams just gave their offense a GIFT!', crowdReaction: 'roar' },
  { playByPlay: 'WHAT A RETURN! {yards} yards all the way to the {fieldPosition}!', colorAnalysis: "He hit the gap and nobody could bring him down! {teamName}'s coverage is in trouble!", crowdReaction: 'roar' },
];

const KICKOFF_TD_RETURN_TEMPLATES: CommentaryTemplate[] = [
  { playByPlay: '{teamName} kicks off... TAKES IT TO THE HOUSE!! KICKOFF RETURN TOUCHDOWN!!', colorAnalysis: 'NOBODY IS GOING TO CATCH HIM! {defTeamName} TAKES IT ALL THE WAY BACK!!', crowdReaction: 'roar' },
  { playByPlay: 'Kickoff... HE BREAKS FREE!! GONE!! TOUCHDOWN!! KICKOFF RETURN TD!!', colorAnalysis: 'WHAT A PLAY! That is a BACKBREAKER for {teamName}! {defTeamName} answers IMMEDIATELY!', crowdReaction: 'roar' },
];

// ---------------------------------------------------------------------------
// EXTRA POINT
// ---------------------------------------------------------------------------

const EXTRA_POINT_TEMPLATES: CommentaryTemplate[] = [
  { playByPlay: 'Extra point is good.', colorAnalysis: 'Routine PAT. Good snap, good hold, good kick.', crowdReaction: 'cheer' },
  { playByPlay: 'PAT is up... good!', colorAnalysis: 'And they add the extra point.', crowdReaction: 'cheer' },
  { playByPlay: 'The extra point sails through. Good.', colorAnalysis: 'No issues there.', crowdReaction: 'cheer' },
];

const EXTRA_POINT_MISSED_TEMPLATES: CommentaryTemplate[] = [
  { playByPlay: 'Extra point is... NO GOOD!', colorAnalysis: 'Uh oh. That missed PAT could come back to haunt them.', crowdReaction: 'gasp' },
  { playByPlay: 'The PAT is blocked! No good!', colorAnalysis: 'That is a huge play! In a close game, that extra point could mean everything!', crowdReaction: 'gasp' },
];

// ---------------------------------------------------------------------------
// TWO-POINT CONVERSION
// ---------------------------------------------------------------------------

const TWO_POINT_SUCCESS_TEMPLATES: CommentaryTemplate[] = [
  { playByPlay: '{passer} finds {receiver}... TWO-POINT CONVERSION IS GOOD!', colorAnalysis: 'Bold call and they EXECUTED it! That changes the math!', crowdReaction: 'roar' },
  { playByPlay: '{rusher} pushes in! Two-point conversion is GOOD!', colorAnalysis: 'Gutsy play call and it pays off!', crowdReaction: 'roar' },
];

const TWO_POINT_FAIL_TEMPLATES: CommentaryTemplate[] = [
  { playByPlay: 'Two-point attempt... NO GOOD! Stopped short!', colorAnalysis: 'They came up empty. That could be costly.', crowdReaction: 'groan' },
  { playByPlay: 'The two-point try... DENIED!', colorAnalysis: 'The defense held the line. Huge stop.', crowdReaction: 'groan' },
];

// ---------------------------------------------------------------------------
// KNEEL / SPIKE
// ---------------------------------------------------------------------------

const KNEEL_TEMPLATES: CommentaryTemplate[] = [
  { playByPlay: '{rusher} takes a knee. {clock} remaining.', colorAnalysis: '{teamName} running out the clock.', crowdReaction: 'murmur' },
  { playByPlay: 'Victory formation. {rusher} kneels on it.', colorAnalysis: 'And that should just about do it for {teamName}.', crowdReaction: 'murmur' },
  { playByPlay: '{rusher} kneels it down. {clock} left.', colorAnalysis: '{teamName} killing the clock. Ball game.', crowdReaction: 'murmur' },
];

const SPIKE_TEMPLATES: CommentaryTemplate[] = [
  { playByPlay: '{passer} spikes it to stop the clock!', colorAnalysis: 'Smart play. They need every second here.', crowdReaction: 'murmur' },
  { playByPlay: '{passer} clocks it! The clock stops.', colorAnalysis: 'They saved the timeout. Good game management.', crowdReaction: 'murmur' },
];

// ---------------------------------------------------------------------------
// PENALTIES
// ---------------------------------------------------------------------------

const PENALTY_TEMPLATES: CommentaryTemplate[] = [
  { playByPlay: 'FLAG on the play! {penaltyName} on {teamName}, {yards} yards.', colorAnalysis: "That's going to cost them.", crowdReaction: 'boo' },
  { playByPlay: 'Penalty flag is down. {penaltyName}, {yards} yards on {teamName}.', colorAnalysis: 'Undisciplined play. You cannot beat yourself with penalties.', crowdReaction: 'boo' },
  { playByPlay: 'We have a flag! {penaltyName}, {teamName}. {yards}-yard penalty.', colorAnalysis: "That is a drive killer. They shot themselves in the foot.", crowdReaction: 'boo' },
  { playByPlay: 'FLAG! {penaltyName} called on {teamName}. {yards} yards.', colorAnalysis: 'The officials saw it and they threw the flag.', crowdReaction: 'boo' },
  { playByPlay: 'Yellow flag on the field. {penaltyName}, {teamName}, {yards} yards.', colorAnalysis: 'Sloppy. You just gave them free yards.', crowdReaction: 'boo' },
  { playByPlay: 'Penalty! {penaltyName} on {teamName}. Marked off {yards} yards.', colorAnalysis: 'That puts them in a much tougher situation now.', crowdReaction: 'boo' },
  { playByPlay: 'FLAG! {penaltyName}! {yards} yards against {teamName}.', colorAnalysis: 'Costly penalty. That wipes out a good play.', crowdReaction: 'boo' },
  { playByPlay: '{penaltyName} on {teamName}. {yards}-yard penalty enforced.', colorAnalysis: 'Discipline. That is what separates good teams from great teams.', crowdReaction: 'boo' },
  { playByPlay: 'Penalty marker is down! {penaltyName}, {teamName}, {yards} yards.', colorAnalysis: 'You just cannot commit that penalty in this situation. Inexcusable.', crowdReaction: 'boo' },
  { playByPlay: 'The flag comes out late! {penaltyName} on {teamName}. {yards} yards.', colorAnalysis: 'The official had a clear view of it. Good call.', crowdReaction: 'boo' },
  { playByPlay: 'Another flag! {penaltyName}, {teamName}, {yards} yards.', colorAnalysis: '{teamName} keeps shooting themselves in the foot with these penalties.', crowdReaction: 'boo' },
  { playByPlay: '{penaltyName} called on {teamName}. Walk off {yards}.', colorAnalysis: 'That gives {defTeamName} a brand new set of downs. Free football.', crowdReaction: 'boo' },
  { playByPlay: 'FLAG is thrown! {penaltyName}. {yards} on {teamName}.', colorAnalysis: 'The coaches on the sideline are NOT happy about that one.', crowdReaction: 'boo' },
];

// ---------------------------------------------------------------------------
// WEATHER-SPECIFIC TEMPLATES
// ---------------------------------------------------------------------------

const WEATHER_RUN_TEMPLATES: CommentaryTemplate[] = [
  { playByPlay: '{rusher} slips but keeps his balance... {yards} yards in the rain. {downResult}', colorAnalysis: 'The footing is treacherous out there. {teamName} has to be careful with the ball.', crowdReaction: 'cheer' },
  { playByPlay: 'Through the snow, {rusher} churns for {yards} yards. {downResult}', colorAnalysis: "Nobody's getting good footing in these conditions.", crowdReaction: 'cheer' },
  { playByPlay: '{rusher} trudges through the slop for {yards}. {downResult}', colorAnalysis: '{weather} making it tough to get anything going on the ground.', crowdReaction: 'murmur' },
];

const WEATHER_PASS_TEMPLATES: CommentaryTemplate[] = [
  { playByPlay: '{passer} throws into the wind... {receiver} hangs on for {yards}. {downResult}', colorAnalysis: 'That ball was moving all over the place. Great catch.', crowdReaction: 'cheer' },
  { playByPlay: 'Through the snow, {passer} finds {receiver} for {yards}. {downResult}', colorAnalysis: "Incredible throw in these conditions. You can barely see out there.", crowdReaction: 'cheer' },
  { playByPlay: '{passer} fights the elements, hits {receiver} for {yards}. {downResult}', colorAnalysis: '{weather} — and he still makes that throw. Impressive.', crowdReaction: 'cheer' },
];

const WEATHER_FG_TEMPLATES: CommentaryTemplate[] = [
  { playByPlay: 'In this wind, a {yards}-yard attempt is no gimme... the kick is up...', colorAnalysis: 'The wind is absolutely howling. This is a gutsy attempt.', crowdReaction: 'silence' },
  { playByPlay: '{yards}-yard attempt in the {weather}... the snap, the hold, the kick...', colorAnalysis: 'Conditions like this can turn a routine kick into an adventure.', crowdReaction: 'silence' },
];

const WEATHER_INCOMPLETE_TEMPLATES: CommentaryTemplate[] = [
  { playByPlay: '{passer} tries to fight through the {weather}... pass sails incomplete.', colorAnalysis: 'The conditions are really affecting the passing game today.', crowdReaction: 'murmur' },
  { playByPlay: 'The ball slips out of {passer}\'s hand... incomplete in the {weather}.', colorAnalysis: "It's nearly impossible to grip the ball in these conditions.", crowdReaction: 'groan' },
];

// ---------------------------------------------------------------------------
// TWO-MINUTE DRILL
// ---------------------------------------------------------------------------

const TWO_MINUTE_TEMPLATES: CommentaryTemplate[] = [
  { playByPlay: "Clock ticking... {passer} fires to {receiver}! First down!", colorAnalysis: "They've got to hurry here!", crowdReaction: 'cheer' },
  { playByPlay: "No time to waste! {passer} spikes it to stop the clock!", colorAnalysis: "Smart play with {clock} left.", crowdReaction: 'murmur' },
  { playByPlay: '{passer} scrambles to the sideline! Gets out of bounds with {clock} left!', colorAnalysis: 'Every second counts now. The urgency is palpable.', crowdReaction: 'cheer' },
  { playByPlay: 'Hurry-up offense! {passer} quick throw to {receiver} for {yards}!', colorAnalysis: 'No huddle! They are racing against the clock!', crowdReaction: 'cheer' },
  { playByPlay: '{passer} takes the snap quickly and fires to {receiver}! {yards} yards!', colorAnalysis: 'Clock is running! They need to GET to the line!', crowdReaction: 'cheer' },
  { playByPlay: '{passer} gets it off just in time! {receiver} for {yards}!', colorAnalysis: 'The play clock was about to expire! Talk about cutting it close!', crowdReaction: 'cheer' },
];

// ---------------------------------------------------------------------------
// CLUTCH / 4TH QUARTER CLOSE GAME
// ---------------------------------------------------------------------------

const CLUTCH_TEMPLATES: CommentaryTemplate[] = [
  { playByPlay: 'This could be the play of the game...', colorAnalysis: 'Everything riding on this.', crowdReaction: 'silence' },
  { playByPlay: '4th and {distance}... the season on the line...', colorAnalysis: 'You can feel the tension in this stadium.', crowdReaction: 'silence' },
  { playByPlay: 'The pressure is IMMENSE here. {passer} takes the snap...', colorAnalysis: 'This is what they live for. This is why they play the game.', crowdReaction: 'silence' },
  { playByPlay: 'Must-have play for {teamName}...', colorAnalysis: 'Win or go home. Right here. Right now.', crowdReaction: 'silence' },
  { playByPlay: '{passer} in the shotgun... the crowd on its feet...', colorAnalysis: "If they don't convert here, it could be over.", crowdReaction: 'silence' },
  { playByPlay: 'Fourth down. Here we go. Season on the line.', colorAnalysis: 'This is the moment you dream about as a kid.', crowdReaction: 'silence' },
];

// ---------------------------------------------------------------------------
// GAME-WINNING SCORES
// ---------------------------------------------------------------------------

const GAME_WINNING_TD_TEMPLATES: CommentaryTemplate[] = [
  { playByPlay: "TOUCHDOWN! THEY'VE DONE IT! {teamName} WINS!", colorAnalysis: 'UNBELIEVABLE! What a finish!', crowdReaction: 'roar' },
  { playByPlay: '{scorer} into the end zone! TOUCHDOWN! {teamName} WINS THE GAME!', colorAnalysis: 'I have CHILLS! What an INCREDIBLE ending!', crowdReaction: 'roar' },
  { playByPlay: 'TOUCHDOWN! {teamName}! THE GAME IS OVER!', colorAnalysis: 'PANDEMONIUM! The sideline has EMPTIED! Everyone is celebrating!', crowdReaction: 'roar' },
  { playByPlay: 'HE SCORES! {teamName} WINS! {teamName} WINS!', colorAnalysis: 'You will NEVER forget this game! WHAT a FINISH!', crowdReaction: 'roar' },
];

const GAME_WINNING_FG_TEMPLATES: CommentaryTemplate[] = [
  { playByPlay: "The kick is up... IT'S GOOD! {teamName} WINS IT!", colorAnalysis: 'What a way to end this football game!', crowdReaction: 'roar' },
  { playByPlay: '{yards} yards for the WIN! The kick... IT IS GOOD!!! {teamName} WINS!', colorAnalysis: 'Ice cold! He was BORN for this moment!', crowdReaction: 'roar' },
  { playByPlay: 'The snap, the hold, the kick... IT IS GOOOOD! GAME OVER! {teamName} WINS!', colorAnalysis: 'WALK-OFF field goal! This place has EXPLODED!', crowdReaction: 'roar' },
];

// ---------------------------------------------------------------------------
// OVERTIME
// ---------------------------------------------------------------------------

const OVERTIME_START_TEMPLATES: CommentaryTemplate[] = [
  { playByPlay: "We're going to OVERTIME!", colorAnalysis: 'Neither team could put this away!', crowdReaction: 'roar' },
  { playByPlay: 'This game is going to OVERTIME! We are NOT done here!', colorAnalysis: 'Buckle up! Free football!', crowdReaction: 'roar' },
  { playByPlay: 'Tied at the end of regulation! OVERTIME!', colorAnalysis: 'What a battle! Neither side willing to give an inch!', crowdReaction: 'roar' },
];

// ---------------------------------------------------------------------------
// TOUCHBACK (on kickoff/punt)
// ---------------------------------------------------------------------------

const TOUCHBACK_TEMPLATES: CommentaryTemplate[] = [
  { playByPlay: 'Touchback. Ball at the 25.', colorAnalysis: 'They will start from the 25-yard line.', crowdReaction: 'murmur' },
  { playByPlay: 'Into the end zone. Touchback.', colorAnalysis: 'Smart. Take the guaranteed field position.', crowdReaction: 'murmur' },
];

// ---------------------------------------------------------------------------
// SITUATIONAL COLOR ANALYSIS
// ---------------------------------------------------------------------------

const SITUATIONAL_COLOR: string[] = [
  "That's now {totalYards} total yards for {playerName} today.",
  "They're {thirdDownRecord} on third down this game.",
  'The momentum has completely shifted here.',
  "{teamName} hasn't scored since the {quarter}.",
  "{teamName} is dominating time of possession. They're wearing this defense down.",
  'This has all the makings of an instant classic.',
  'The halftime adjustments have clearly worked.',
  "They're clicking on all cylinders right now.",
  "If you're just tuning in, you are watching one HECK of a football game.",
  'The defensive coordinator needs to make some adjustments and fast.',
  '{playerName} is having the game of his LIFE today.',
  'That is drive number {driveNumber} ending without points. The offense has to figure something out.',
  'You can see the frustration on the sideline.',
  "I've been doing this a long time, and this is one of the best games I've seen all year.",
  "{teamName} wants to run the ball and they are DARING you to stop them.",
  'Both quarterbacks are playing at an elite level today.',
  'The crowd is back in this game now. You can FEEL the energy.',
  'This is a chess match between these two coaching staffs.',
  'Field position has been the story of this quarter.',
  'Neither defense is giving an inch right now.',
  'The offensive line is creating running lanes today. It all starts up front.',
  'That might be the loudest this crowd has been all game.',
  '{teamName} is just imposing their will on this football game.',
  'The turnovers have been the difference in this one.',
  'Every time you think {teamName} is out of it, they make a play.',
  'This feels like a playoff game. The intensity is through the roof.',
  '{playerName} is making his case for game MVP right now.',
  'You can see the confidence building with every completion for {teamName}.',
  'The defensive adjustments at the half have been the story of this second half.',
  '{teamName} has found something that works and they keep going back to it.',
  'Both coaches are emptying the playbook right now.',
  'The physicality in the trenches is incredible today.',
  'Special teams has been the unsung hero in this game.',
  'This is a heavyweight bout. Both teams trading haymakers.',
];

// ============================================================================
// HELPER: Map penalty types to human-readable names
// ============================================================================

// ---------------------------------------------------------------------------
// ROUTE CONCEPT & DEFENSIVE SCHEME DISPLAY NAMES
// ---------------------------------------------------------------------------

const CONCEPT_DISPLAY: Record<string, string> = {
  hitch: 'hitch', curl: 'curl', shake: 'shake', angle: 'angle', stick: 'stick',
  semi: 'semi', bench: 'bench', drive: 'drive', cross: 'crossing', blinky: 'blinky',
  go: 'go', cab: 'cab', pylon: 'pylon', x_ray: 'x-ray', delta: 'delta',
  screen: 'screen', waggle: 'waggle',
};

const PERSONNEL_DISPLAY: Record<string, string> = {
  '00': '5-wide', '10': '10 personnel', '11': '11 personnel',
  '12': '12 personnel', '13': '13 personnel',
  '21': '21 personnel', '22': '22 personnel',
};

const FRONT_DISPLAY: Record<string, string> = {
  odd: 'Odd', over: 'Over', under: 'Under', reduce: 'Reduce', sink_46: '46',
};

const RUSH_GAME_DISPLAY: Record<string, string> = {
  t_e: 'T-E', e_t: 'E-T', tom: 'Tom',
};

const STUNT_DISPLAY: Record<string, string> = {
  stir: 'Stir', knife: 'Knife',
};

const PENALTY_NAMES: Record<string, string> = {
  holding_offense: 'Offensive Holding',
  holding_defense: 'Defensive Holding',
  false_start: 'False Start',
  offsides: 'Offsides',
  encroachment: 'Encroachment',
  pass_interference_offense: 'Offensive Pass Interference',
  pass_interference_defense: 'Defensive Pass Interference',
  roughing_the_passer: 'Roughing the Passer',
  unnecessary_roughness: 'Unnecessary Roughness',
  facemask: 'Facemask',
  illegal_formation: 'Illegal Formation',
  delay_of_game: 'Delay of Game',
  illegal_block: 'Illegal Block in the Back',
  illegal_contact: 'Illegal Contact',
  neutral_zone_infraction: 'Neutral Zone Infraction',
  unsportsmanlike_conduct: 'Unsportsmanlike Conduct',
  intentional_grounding: 'Intentional Grounding',
  ineligible_downfield: 'Ineligible Receiver Downfield',
  illegal_use_of_hands: 'Illegal Use of Hands',
  tripping: 'Tripping',
  horse_collar: 'Horse Collar Tackle',
  too_many_men: 'Too Many Men on the Field',
};

// ============================================================================
// HELPER: Classify excitement level from 0-100 numeric scale
// ============================================================================

function getExcitementLevel(excitement: number): ExcitementLevel {
  if (excitement < 35) return 'low';
  if (excitement < 70) return 'medium';
  return 'high';
}

// ============================================================================
// HELPER: Determine field position string from ball position number
// ============================================================================

function formatFieldPosition(ballPosition: number): string {
  if (ballPosition === 50) return 'the 50-yard line';
  if (ballPosition < 50) {
    return `their own ${ballPosition}`;
  }
  return `the ${100 - ballPosition}-yard line`;
}

// ============================================================================
// HELPER: Select random template from array using seeded RNG
// ============================================================================

function pickRandom<T>(
  arr: T[],
  rng: { randomInt: (min: number, max: number) => number },
): T {
  return arr[rng.randomInt(0, arr.length - 1)];
}

// ============================================================================
// HELPER: Determine if this is a two-minute drill situation
// ============================================================================

function isTwoMinuteSituation(state: GameState): boolean {
  return (
    state.clock <= 120 &&
    (state.quarter === 2 || state.quarter === 4 || state.quarter === 'OT')
  );
}

// ============================================================================
// HELPER: Determine if this is a clutch moment
// ============================================================================

function isClutchMoment(state: GameState): boolean {
  const scoreDiff = Math.abs(state.homeScore - state.awayScore);
  return (
    (state.quarter === 4 || state.quarter === 'OT') &&
    scoreDiff <= 8 &&
    state.clock <= 300
  );
}

// ============================================================================
// HELPER: Determine if this is a game-winning score situation
// ============================================================================

function isGameWinner(play: PlayResult, state: GameState): boolean {
  if (!play.scoring) return false;
  const quarter = state.quarter;
  if (quarter !== 4 && quarter !== 'OT') return false;

  const homeScore = state.homeScore;
  const awayScore = state.awayScore;
  const scoringTeam = play.scoring.team;
  const points = play.scoring.points;

  if (scoringTeam === 'home') {
    return homeScore + points > awayScore && homeScore <= awayScore;
  } else {
    return awayScore + points > homeScore && awayScore <= homeScore;
  }
}

// ============================================================================
// PUBLIC API: getTemplate
// ============================================================================

/**
 * Get a commentary template for a play based on play type, excitement,
 * and game situation. Returns a template with unfilled variable placeholders.
 */
export function getTemplate(
  play: PlayResult,
  state: GameState,
  excitement: number,
  rng: { randomInt: (min: number, max: number) => number },
): CommentaryTemplate {
  const level = getExcitementLevel(excitement);

  // -----------------------------------------------------------------------
  // Game-winning scores get special treatment
  // -----------------------------------------------------------------------
  if (isGameWinner(play, state)) {
    if (play.isTouchdown) {
      return pickRandom(GAME_WINNING_TD_TEMPLATES, rng);
    }
    if (play.type === 'field_goal' && play.scoring) {
      return pickRandom(GAME_WINNING_FG_TEMPLATES, rng);
    }
  }

  // -----------------------------------------------------------------------
  // Touchdowns always get epic commentary
  // -----------------------------------------------------------------------
  if (play.isTouchdown) {
    // Defensive / turnover touchdowns
    if (play.turnover?.returnedForTD) {
      if (play.turnover.type === 'interception') {
        return pickRandom(INTERCEPTION_TEMPLATES.high, rng);
      }
      return pickRandom(FUMBLE_TEMPLATES.high, rng);
    }
    // Passing touchdowns
    if (play.type === 'pass_complete' && play.passer && play.receiver) {
      return pickRandom(TOUCHDOWN_PASS_TEMPLATES, rng);
    }
    // Rushing touchdowns (including scrambles)
    return pickRandom(TOUCHDOWN_RUSH_TEMPLATES, rng);
  }

  // -----------------------------------------------------------------------
  // Penalties override the play type
  // -----------------------------------------------------------------------
  if (play.penalty && !play.penalty.declined && !play.penalty.offsetting) {
    return pickRandom(PENALTY_TEMPLATES, rng);
  }

  // -----------------------------------------------------------------------
  // Turnovers (non-touchdown)
  // -----------------------------------------------------------------------
  if (play.turnover) {
    if (play.turnover.type === 'interception') {
      return pickRandom(INTERCEPTION_TEMPLATES[level], rng);
    }
    if (play.turnover.type === 'fumble' || play.turnover.type === 'fumble_recovery') {
      return pickRandom(FUMBLE_TEMPLATES[level], rng);
    }
  }

  // -----------------------------------------------------------------------
  // Clutch situations (4th quarter, close game, 4th down)
  // -----------------------------------------------------------------------
  if (isClutchMoment(state) && state.down === 4 && level !== 'low') {
    return pickRandom(CLUTCH_TEMPLATES, rng);
  }

  // -----------------------------------------------------------------------
  // Two-minute drill gets special templates mixed in
  // -----------------------------------------------------------------------
  if (isTwoMinuteSituation(state) && play.type === 'pass_complete' && rng.randomInt(0, 2) === 0) {
    return pickRandom(TWO_MINUTE_TEMPLATES, rng);
  }

  if (play.type === 'spike') {
    return pickRandom(SPIKE_TEMPLATES, rng);
  }

  // -----------------------------------------------------------------------
  // Weather-specific templates (~30% of the time in bad weather)
  // -----------------------------------------------------------------------
  const hasWeather = state.weather && (state.weather.type === 'rain' || state.weather.type === 'snow' || state.weather.type === 'wind' || state.weather.type === 'fog');
  if (hasWeather && rng.randomInt(0, 9) < 3) {
    if (play.type === 'run') return pickRandom(WEATHER_RUN_TEMPLATES, rng);
    if (play.type === 'pass_complete') return pickRandom(WEATHER_PASS_TEMPLATES, rng);
    if (play.type === 'pass_incomplete') return pickRandom(WEATHER_INCOMPLETE_TEMPLATES, rng);
    if (play.type === 'field_goal') return pickRandom(WEATHER_FG_TEMPLATES, rng);
  }

  // -----------------------------------------------------------------------
  // Standard play type selection
  // -----------------------------------------------------------------------
  switch (play.type) {
    case 'run':
      return pickRandom(RUN_TEMPLATES[level], rng);

    case 'pass_complete':
      return pickRandom(PASS_COMPLETE_TEMPLATES[level], rng);

    case 'pass_incomplete':
      return pickRandom(PASS_INCOMPLETE_TEMPLATES[level], rng);

    case 'sack':
      return pickRandom(SACK_TEMPLATES[level], rng);

    case 'scramble':
      return pickRandom(SCRAMBLE_TEMPLATES[level], rng);

    case 'field_goal':
      if (play.scoring) {
        return pickRandom(FIELD_GOAL_MADE_TEMPLATES[level], rng);
      }
      return pickRandom(FIELD_GOAL_MISSED_TEMPLATES[level], rng);

    case 'punt':
      return pickRandom(PUNT_TEMPLATES[level], rng);

    case 'kickoff': {
      // Tiered kickoff commentary based on return yards
      if (play.isTouchdown && play.scoring) {
        return pickRandom(KICKOFF_TD_RETURN_TEMPLATES, rng);
      }
      const koYards = play.yardsGained;
      if (koYards === 0) return pickRandom(KICKOFF_TOUCHBACK_TEMPLATES, rng);
      if (koYards < 20) return pickRandom(KICKOFF_SHORT_RETURN_TEMPLATES, rng);
      if (koYards < 35) return pickRandom(KICKOFF_GOOD_RETURN_TEMPLATES, rng);
      return pickRandom(KICKOFF_BIG_RETURN_TEMPLATES, rng);
    }

    case 'extra_point':
      if (play.scoring) {
        return pickRandom(EXTRA_POINT_TEMPLATES, rng);
      }
      return pickRandom(EXTRA_POINT_MISSED_TEMPLATES, rng);

    case 'two_point':
      if (play.scoring) {
        return pickRandom(TWO_POINT_SUCCESS_TEMPLATES, rng);
      }
      return pickRandom(TWO_POINT_FAIL_TEMPLATES, rng);

    case 'kneel':
      return pickRandom(KNEEL_TEMPLATES, rng);

    case 'touchback':
      return pickRandom(TOUCHBACK_TEMPLATES, rng);

    default: {
      // Fallback for any unmatched type
      return {
        playByPlay: play.description,
        colorAnalysis: 'Interesting play there.',
        crowdReaction: 'murmur',
      };
    }
  }
}

// ============================================================================
// PUBLIC API: fillTemplate
// ============================================================================

/**
 * Fill template variables with actual values.
 * Template variables use the format {variableName}.
 * Unmatched variables are left as-is to avoid broken output.
 */
export function fillTemplate(
  template: CommentaryTemplate,
  vars: Record<string, string>,
): { playByPlay: string; colorAnalysis: string; crowdReaction: CrowdReaction } {
  function replace(text: string): string {
    return text.replace(/\{(\w+)\}/g, (match, key) => {
      return vars[key] !== undefined ? vars[key] : match;
    });
  }

  return {
    playByPlay: replace(template.playByPlay),
    colorAnalysis: replace(template.colorAnalysis),
    crowdReaction: template.crowdReaction,
  };
}

// ============================================================================
// PUBLIC API: Build template variables from play data
// ============================================================================

/**
 * Extract all template variable values from a play result and game state.
 * Returns a Record<string, string> ready to pass to fillTemplate.
 */
export function buildTemplateVars(
  play: PlayResult,
  state: GameState,
): Record<string, string> {
  const possessionTeam =
    state.possession === 'home' ? state.homeTeam : state.awayTeam;
  const defendingTeam =
    state.possession === 'home' ? state.awayTeam : state.homeTeam;

  // Build down result text (what happened after the play)
  let downResult = '';
  if (play.isFirstDown && !play.isTouchdown) {
    downResult = 'First down!';
  } else if (play.isTouchdown) {
    downResult = '';
  } else if (state.down < 4) {
    const nextDown = state.down + 1;
    const remaining = Math.max(1, state.yardsToGo - play.yardsGained);
    downResult = `That brings up ${formatDown(nextDown as 1|2|3|4)} and ${remaining}.`;
  }

  const vars: Record<string, string> = {
    teamName: possessionTeam.name,
    defTeamName: defendingTeam.name,
    yards: Math.abs(play.yardsGained).toString(),
    down: formatDown(state.down),
    distance: state.yardsToGo.toString(),
    downResult,
    fieldPosition: formatFieldPosition(state.ballPosition),
    clock: formatClockForTemplate(state.clock),
    quarter: formatQuarterForTemplate(state.quarter),
    direction: play.yardsGained >= 0 ? 'right' : 'left',
  };

  if (play.passer) {
    vars.passer = play.passer.name;
  }
  if (play.rusher) {
    vars.rusher = play.rusher.name;
  }
  if (play.receiver) {
    vars.receiver = play.receiver.name;
  }
  if (play.defender) {
    vars.defender = play.defender.name;
    vars.defenderName = play.defender.name;
  }
  if (play.scoring?.scorer) {
    vars.scorer = play.scoring.scorer.name;
  }
  if (play.penalty) {
    vars.penaltyName = PENALTY_NAMES[play.penalty.type] || play.penalty.type;
    if (play.penalty.on === 'home') {
      vars.teamName = state.homeTeam.name;
    } else {
      vars.teamName = state.awayTeam.name;
    }
    vars.yards = play.penalty.yards.toString();
  }

  // Punter name: use passer or rusher as stand-in
  vars.punter = play.passer?.name || play.rusher?.name || 'The punter';

  // Route concept and defensive scheme vars
  if (play.routeConcept) {
    vars.concept = CONCEPT_DISPLAY[play.routeConcept] || play.routeConcept;
  }
  if (play.personnelGrouping) {
    vars.personnel = PERSONNEL_DISPLAY[play.personnelGrouping] || play.personnelGrouping;
  }
  if (play.defensiveCall?.front) {
    vars.front = FRONT_DISPLAY[play.defensiveCall.front] || play.defensiveCall.front;
  }
  if (play.defensiveCall?.passRushGame && play.defensiveCall.passRushGame !== 'none') {
    vars.rushGame = RUSH_GAME_DISPLAY[play.defensiveCall.passRushGame] || play.defensiveCall.passRushGame;
  }
  if (play.defensiveCall?.runStunt && play.defensiveCall.runStunt !== 'none') {
    vars.stunt = STUNT_DISPLAY[play.defensiveCall.runStunt] || play.defensiveCall.runStunt;
  }

  // Weather variable
  if (state.weather) {
    const weatherLabels: Record<string, string> = {
      rain: 'rain', snow: 'snow', fog: 'fog', wind: 'wind',
      clear: 'clear skies', cloudy: 'overcast skies',
    };
    vars.weather = weatherLabels[state.weather.type] || state.weather.type;
  }

  return vars;
}

// ============================================================================
// HELPER: Format down for template
// ============================================================================

function formatDown(down: 1 | 2 | 3 | 4): string {
  const suffixes = { 1: '1st', 2: '2nd', 3: '3rd', 4: '4th' } as const;
  return suffixes[down];
}

// ============================================================================
// HELPER: Format clock for template (M:SS)
// ============================================================================

function formatClockForTemplate(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${mins}:${secs.toString().padStart(2, '0')}`;
}

// ============================================================================
// HELPER: Format quarter for template
// ============================================================================

function formatQuarterForTemplate(quarter: 1 | 2 | 3 | 4 | 'OT'): string {
  if (quarter === 'OT') return 'overtime';
  const names = { 1: '1st quarter', 2: '2nd quarter', 3: '3rd quarter', 4: '4th quarter' } as const;
  return names[quarter];
}

// ============================================================================
// EXPORT: Situational color for external use
// ============================================================================

/**
 * Get a random situational color analysis line.
 * Useful for adding variety to template commentary.
 */
export function getSituationalColor(
  rng: { randomInt: (min: number, max: number) => number },
): string {
  return pickRandom(SITUATIONAL_COLOR, rng);
}

/**
 * Get overtime start commentary.
 */
export function getOvertimeTemplate(
  rng: { randomInt: (min: number, max: number) => number },
): CommentaryTemplate {
  return pickRandom(OVERTIME_START_TEMPLATES, rng);
}
